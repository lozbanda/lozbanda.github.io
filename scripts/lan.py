#!/usr/bin/env python3
"""Partager uniquement site/ sur un LAN de confiance, sans dépendance Python.
Service utilisateur temporaire : pas de démarrage automatique au prochain boot.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import IPv4Address, IPv4Network
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
UNIT = 'lozbanda-lan.service'
PRIVATE = tuple(IPv4Network(net) for net in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))


def json_command(*command):
    return json.loads(subprocess.check_output(command, text=True))


def lan_address(requested=None):
    """Une IPv4 privée réellement affectée à une interface, jamais 0.0.0.0."""
    interfaces = json_command('ip', '-j', '-4', 'address', 'show', 'up')
    addresses = {entry['local']: interface['ifname'] for interface in interfaces
                 for entry in interface.get('addr_info', [])
                 if entry.get('scope') == 'global'
                 and any(IPv4Address(entry['local']) in network for network in PRIVATE)}
    if requested:
        if requested not in addresses:
            raise ValueError('Choisir une IPv4 privée présente sur cet ordinateur, pas une adresse publique ou 0.0.0.0.')
        return requested
    routes = json_command('ip', '-j', '-4', 'route', 'show', 'default')
    default_interfaces = {route.get('dev') for route in routes}
    candidates = [ip for ip, interface in addresses.items() if interface in default_interfaces]
    if len(candidates) != 1:
        raise ValueError('Impossible de choisir un réseau unique. Utiliser start --host ADRESSE_IP_LOCALE.')
    return candidates[0]


class CompiledSiteHandler(SimpleHTTPRequestHandler):
    # Pas de répertoire listé, fichier caché ou lien symbolique sortant de site/.
    # La racine reste un chemin absolu, pas le cwd dans l’ancien inode de site/ :
    # npm run build peut ainsi remplacer le dossier sans redémarrer le serveur.
    def send_head(self):
        self.audio_remaining = None
        root = Path(self.directory)
        path = Path(self.translate_path(self.path))
        try:
            allowed = (not root.is_symlink()
                       and path.resolve().is_relative_to(root.resolve())
                       and not any(part.startswith('.') for part in path.relative_to(root).parts))
            if allowed and path.is_dir():
                for name in ('index.html', 'index.htm'):
                    index = path / name
                    if index.is_file():
                        allowed = index.resolve().is_relative_to(root.resolve())
                        break
        except (OSError, ValueError):
            allowed = False
        if not allowed:
            self.send_error(404)
            return None
        if path.is_file() and path.suffix.lower() in {'.mp3', '.wav', '.wave'}:
            return self.send_audio(path)
        return super().send_head()

    def send_audio(self, path):
        """Plage unique HTTP : Chrome en a besoin pour avancer dans un MP3/WAV."""
        try:
            stream = path.open('rb')
            stat = os.fstat(stream.fileno())
        except OSError:
            self.send_error(404)
            return None
        size = stat.st_size
        start, end = 0, size - 1
        header = self.headers.get('Range', '')
        # Un If-Range non validé ou une plage multiple reçoit le fichier entier.
        match = (re.fullmatch(r'bytes=(\d*)-(\d*)', header) if len(header) <= 80
                 and self.command == 'GET' and not self.headers.get('If-Range') else None)
        partial = bool(match and any(match.groups()))
        if partial:
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size - 1) if last else size - 1
            else:
                start = max(0, size - int(last))
            if start >= size or start > end:
                stream.close()
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return None
        self.audio_remaining = max(0, end - start + 1)
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type', 'audio/mpeg' if path.suffix.lower() == '.mp3' else 'audio/wav')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(self.audio_remaining))
        self.send_header('Last-Modified', self.date_time_string(stat.st_mtime))
        if partial:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        stream.seek(start)
        return stream

    def copyfile(self, source, outputfile):
        if self.audio_remaining is None:
            return super().copyfile(source, outputfile)
        remaining = self.audio_remaining
        while remaining > 0:
            chunk = source.read(min(65536, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()


def serve(host, port):
    if not SITE.joinpath('index.html').is_file() or SITE.is_symlink():
        raise ValueError('site/index.html manque : générer le site avant de le partager.')
    handler = partial(CompiledSiteHandler, directory=str(SITE))
    with ThreadingHTTPServer((host, port), handler) as server:
        print(f'Site compilé : http://{host}:{port}/ — racine : {SITE}', flush=True)
        server.serve_forever()


def active():
    return subprocess.run(['systemctl', '--user', 'is-active', '--quiet', UNIT]).returncode == 0


def start(host, port):
    if active():
        print('Partage déjà actif. Pour changer d’adresse, arrêter puis relancer.')
        subprocess.run(['systemctl', '--user', 'show', UNIT, '-p', 'Description', '--value'], check=True)
        return
    if not SITE.joinpath('index.html').is_file() or SITE.is_symlink():
        raise ValueError('site/index.html manque : exécuter npm run build avant le partage.')
    address = lan_address(host)
    subprocess.run([
        'systemd-run', '--user', '--collect', f'--unit={UNIT}', '--service-type=exec',
        f'--description=LozBanda — site compilé — http://{address}:{port}/',
        f'--working-directory={ROOT}', '--property=NoNewPrivileges=yes',
        '--property=UMask=0077',
        sys.executable, '-u', str(Path(__file__).resolve()), 'serve',
        '--host', address, '--port', str(port),
    ], check=True)
    time.sleep(0.3)
    if not active():
        raise ValueError(f'Échec du démarrage. Consulter journalctl --user -u {UNIT} -n 30 --no-pager.')
    print(f'Partage démarré : http://{address}:{port}/')
    print('Le pare-feu doit autoriser ce port depuis le LAN. Aucune règle système n’est modifiée par ce script.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('start', 'stop', 'status', 'serve'))
    parser.add_argument('--host', help='IPv4 privée locale ; détectée sur la route par défaut si omise')
    parser.add_argument('--port', type=int, default=8012)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('Port attendu entre 1 et 65535.')
    try:
        if args.action == 'start':
            start(args.host, args.port)
        elif args.action == 'serve':
            serve(lan_address(args.host), args.port)
        elif args.action == 'stop':
            subprocess.run(['systemctl', '--user', 'stop', UNIT], check=True)
        else:
            return subprocess.run(['systemctl', '--user', 'status', UNIT, '--no-pager']).returncode
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Partage LAN : {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
