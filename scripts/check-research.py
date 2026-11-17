"""Probe health and the public authentication boundary. No keys or paid calls."""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


def check(base):
    url = urllib.parse.urlsplit(base)
    if (url.scheme not in ('http', 'https') or not url.hostname or url.username
            or url.password or url.query or url.fragment
            or (url.scheme == 'http' and url.hostname not in ('127.0.0.1', 'localhost'))):
        raise ValueError('請使用 HTTPS 服務網址，HTTP 僅允許 localhost')
    base = base.rstrip('/')
    with urllib.request.urlopen(base + '/v1/status', timeout=60) as response:
        status = json.load(response)
    if not (status.get('configured') and status.get('version') == '0.7.3'
            and status.get('auth') == 'firebase'):
        raise ValueError('後端版本或登入設定不符合 0.7.3')
    # Empty body suffices: authentication must reject it before processing a job.
    request = urllib.request.Request(base + '/v1/analyses', data=b'{}',
                                     headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=60):
            raise ValueError('未登入請求竟然成功，請勿發布服務')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise ValueError(f'未登入請求預期 401，實際 {error.code}') from None
    print(json.dumps({'version': status['version'], 'health': 'ok',
                      'unauthenticated': 401, 'live_model_tested': False,
                      'kronos_api_tested': False}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        check(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000')
    except (ValueError, OSError) as error:
        # Do not print full request URLs, headers or upstream error pages.
        print('部署檢查失敗：' + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
