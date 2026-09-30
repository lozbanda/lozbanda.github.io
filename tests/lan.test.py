#!/usr/bin/env python3
"""Serveur compilé : tests locaux, sans systemd, pare-feu ou exposition réseau."""
from functools import partial
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('lan', Path(__file__).resolve().parents[1] / 'scripts/lan.py')
lan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lan)


class QuietHandler(lan.CompiledSiteHandler):
    def log_message(self, *args):
        pass


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix='lozbanda-lan-test-')
        self.root = Path(self.temp.name)
        self.site = self.root / 'site'
        self.site.mkdir()
        (self.site / 'index.html').write_text('<h1>Site compilé</h1>')
        (self.root / 'secret.md').write_text('Privé')
        (self.site / '.secret').write_text('Privé')
        (self.site / 'assets').mkdir()
        (self.site / 'assets/photo.webp').write_bytes(b'RIFF-test')
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(self.site)))
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def get(self, path, headers=None, method='GET'):
        connection = HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        try:
            connection.request(method, path, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_compiled_files_and_no_cache(self):
        status, headers, body = self.get('/')
        self.assertEqual(status, 200)
        self.assertIn('Site compilé', body.decode())
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(self.get('/assets/photo.webp')[0], 200)

    def test_audio_full_file_and_head(self):
        (self.site / 'assets/test.mp3').write_bytes(b'0123456789')
        status, headers, body = self.get('/assets/test.mp3')
        self.assertEqual((status, body), (200, b'0123456789'))
        self.assertEqual(headers['Accept-Ranges'], 'bytes')
        self.assertEqual(headers['Content-Type'], 'audio/mpeg')
        status, headers, body = self.get('/assets/test.mp3', {'Range': 'bytes=2-5'}, 'HEAD')
        self.assertEqual((status, body), (200, b''))
        self.assertEqual(headers['Content-Length'], '10')

    def test_audio_ranges(self):
        (self.site / 'assets/test.WAV').write_bytes(b'0123456789')
        for requested, content_range, expected in [('bytes=2-5', 'bytes 2-5/10', b'2345'),
                ('bytes=7-', 'bytes 7-9/10', b'789'), ('bytes=-3', 'bytes 7-9/10', b'789'),
                ('bytes=0-999', 'bytes 0-9/10', b'0123456789')]:
            with self.subTest(requested=requested):
                status, headers, body = self.get('/assets/test.WAV', {'Range': requested})
                self.assertEqual((status, body), (206, expected))
                self.assertEqual(headers['Content-Range'], content_range)
                self.assertEqual(int(headers['Content-Length']), len(expected))
                self.assertEqual(headers['Content-Type'], 'audio/wav')

    def test_invalid_audio_ranges(self):
        (self.site / 'assets/test.mp3').write_bytes(b'0123456789')
        for requested in ['bytes=10-', 'bytes=7-2', 'bytes=-0']:
            status, headers, body = self.get('/assets/test.mp3', {'Range': requested})
            self.assertEqual((status, body), (416, b''))
            self.assertEqual(headers['Content-Range'], 'bytes */10')
        for requested in ['minutes=0-5', 'bytes=0-1,3-4', 'bytes=-', 'malformed']:
            self.assertEqual(self.get('/assets/test.mp3', {'Range': requested})[0], 200)
        self.assertEqual(self.get('/assets/test.mp3', {'Range': 'bytes=2-5', 'If-Range': 'obsolete'})[0], 200)

    def test_audio_range_cannot_expose_private_files(self):
        (self.site / 'assets/outside.mp3').symlink_to(self.root / 'secret.md')
        for path in ['/assets/outside.mp3', '/.secret', '/../secret.md']:
            self.assertEqual(self.get(path, {'Range': 'bytes=0-9'})[0], 404)

    def test_sources_hidden_files_and_directory_indexes_denied(self):
        for path in ['/secret.md', '/../secret.md', '/%2e%2e/secret.md', '/contenu/agenda.md',
                     '/src/index.njk', '/.secret', '/%2esecret', '/assets/']:
            with self.subTest(path=path):
                status, _, body = self.get(path)
                self.assertEqual(status, 404)
                self.assertNotIn('Privé', body.decode())

    def test_symlinks_outside_site_and_symlinked_index_denied(self):
        (self.site / 'outside.md').symlink_to(self.root / 'secret.md')
        (self.site / 'outside').symlink_to(self.root, target_is_directory=True)
        (self.site / 'assets/index.html').symlink_to(self.root / 'secret.md')
        for path in ['/outside.md', '/outside/secret.md', '/assets/']:
            self.assertEqual(self.get(path)[0], 404)

    def test_rebuild_visible_without_server_restart(self):
        self.site.rename(self.root / 'previous')
        self.site.mkdir()
        (self.site / 'index.html').write_text('Nouvelle génération')
        self.assertEqual(self.get('/')[2].decode(), 'Nouvelle génération')

    def test_replacing_site_by_symlink_is_denied(self):
        self.site.rename(self.root / 'previous')
        self.site.symlink_to(self.root, target_is_directory=True)
        self.assertEqual(self.get('/secret.md')[0], 404)


class AddressTests(unittest.TestCase):
    def setUp(self):
        self.interfaces = [{'ifname': 'wifi-test', 'addr_info': [
            {'local': '192.168.1.34', 'scope': 'global'}]}]
        self.routes = [{'dev': 'wifi-test'}]

    def test_default_private_address(self):
        with patch.object(lan, 'json_command', side_effect=[self.interfaces, self.routes]):
            self.assertEqual(lan.lan_address(), '192.168.1.34')

    def test_explicit_address_must_be_private_and_assigned(self):
        for address in ['0.0.0.0', '127.0.0.1', '8.8.8.8', '192.168.1.100', '::', 'invalid']:
            with self.subTest(address=address), patch.object(lan, 'json_command', return_value=self.interfaces):
                with self.assertRaises(ValueError):
                    lan.lan_address(address)
        with patch.object(lan, 'json_command', return_value=self.interfaces):
            self.assertEqual(lan.lan_address('192.168.1.34'), '192.168.1.34')

    def test_ambiguous_network_requires_explicit_choice(self):
        self.interfaces[0]['addr_info'].append({'local': '192.168.1.35', 'scope': 'global'})
        with patch.object(lan, 'json_command', side_effect=[self.interfaces, self.routes]):
            with self.assertRaises(ValueError):
                lan.lan_address()


if __name__ == '__main__':
    unittest.main()
