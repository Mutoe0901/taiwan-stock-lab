"""One analysis per child process; secrets enter via stdin, never argv or disk."""
import json
import sys
from .models import AnalyzeRequest


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def main():
    req = AnalyzeRequest.model_validate_json(sys.stdin.read())
    try:
        from .agents import analyze
        report = analyze(req, lambda stage, percent: emit({'type': 'progress', 'stage': stage, 'progress': percent}))
        emit({'type': 'result', 'report': report})
    except Exception as exc:
        # Do not serialize provider exceptions: they may contain request bodies/credentials.
        status = getattr(exc, 'status_code', None)
        message = {401: '模型金鑰無效，請檢查後重新分析。', 403: '模型權限不足。',
                   429: '模型額度或請求頻率達上限，請稍後重試。'}.get(status,
                   '分析服務失敗；請檢查模型名稱、金鑰權限與網路連線後重試。')
        emit({'type': 'error', 'message': message, 'kind': type(exc).__name__})
        sys.exit(1)


if __name__ == '__main__': main()
