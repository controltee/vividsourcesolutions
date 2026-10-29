#!/usr/bin/env python3
"""Serve the site locally with its clean page, project, and client routes."""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        original = Path(super().translate_path(path))
        if original.exists():
            return str(original)

        parts = unquote(urlsplit(path).path).strip('/').split('/')
        if len(parts) == 1 and parts[0] and '.' not in parts[0]:
            page = ROOT / (parts[0] + '.html')
            return str(page if page.is_file() else ROOT / 'project.html')
        if len(parts) == 2 and parts[0] == 'clients' and parts[1]:
            return str(ROOT / 'client.html')
        return str(original)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--bind', default='127.0.0.1')
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    print(f'Serving {ROOT} on {args.bind}:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
