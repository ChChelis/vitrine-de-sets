#!/usr/bin/env python3
"""Servidor local sem cache (o http.server padrão deixa o navegador reaproveitar módulos JS antigos). Uso: python tools/devserver.py [porta]"""
import http.server, sys, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8080), H).serve_forever()
