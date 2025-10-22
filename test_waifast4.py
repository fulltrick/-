import json
import types
import unittest
from pathlib import Path

NOTEBOOK_PATH = Path(__file__).resolve().parent / "waifast4.ipynb"
SENTINEL = "print('🧪 Notebook kernel Python (参考):')"


def load_notebook_runtime():
    with NOTEBOOK_PATH.open(encoding="utf-8") as handle:
        notebook = json.load(handle)
    for cell in notebook.get("cells", []):
        if cell.get("cell_type") != "code":
            continue
        source = "".join(cell.get("source", []))
        if "def start_gradio_live_monitor" not in source:
            continue
        prelude = source.split(SENTINEL, 1)[0]
        module = types.ModuleType("waifast4_runtime")
        exec(prelude, module.__dict__)
        return module
    raise AssertionError("Could not locate waifast4 runtime cell")


class ImmediateThread:
    def __init__(
        self,
        *thread_args,
        target=None,
        name=None,
        args=None,
        kwargs=None,
        daemon=None,
        **thread_kwargs,
    ):
        if thread_args not in {(), (None,)}:
            raise TypeError("ImmediateThread only supports group positional argument")
        if thread_kwargs:
            raise TypeError(f"Unsupported Thread kwargs: {sorted(thread_kwargs)}")
        self._target = target
        self._args = args or ()
        self._kwargs = kwargs or {}
        self.name = name
        self.daemon = daemon
        self.started = False

    def start(self):
        self.started = True
        if self._target is not None:
            self._target(*self._args, **self._kwargs)

    def join(self, timeout=None):  # noqa: D401 - mimic threading.Thread API
        return None

    def is_alive(self):
        return False


class DummyProcess:
    def __init__(self, poll_result=None):
        self._poll_result = poll_result

    def poll(self):
        return self._poll_result


class StartGradioLiveMonitorTests(unittest.TestCase):
    def setUp(self):
        self.runtime = load_notebook_runtime()
        self.addCleanup(self._restore_runtime_state)
        self._original_urlopen = getattr(self.runtime.urllib.request, "urlopen")
        self._original_thread = self.runtime.threading.Thread

    def _restore_runtime_state(self):
        self.runtime.urllib.request.urlopen = self._original_urlopen
        self.runtime.threading.Thread = self._original_thread
        self.runtime.DRY_RUN = False

    def test_blank_url_triggers_notification(self):
        calls = []

        def fake_notification():
            calls.append(True)

        self.runtime.play_notification = fake_notification
        self.runtime.start_gradio_live_monitor("   ", DummyProcess())
        self.assertEqual(len(calls), 1)

    def test_dry_run_plays_notification(self):
        calls = []

        def fake_notification():
            calls.append(True)

        self.runtime.DRY_RUN = True
        self.runtime.play_notification = fake_notification
        self.runtime.start_gradio_live_monitor("https://example.org", DummyProcess())
        self.assertEqual(len(calls), 1)

    def test_successful_url_triggers_notification_after_poll(self):
        self.runtime.DRY_RUN = False
        notification_calls = []

        def fake_notification():
            notification_calls.append(True)

        class DummyResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def getcode(self):
                return self.status

        def fake_urlopen(url, timeout=10):
            self.assertEqual(url, "https://example.com")
            self.assertEqual(timeout, 10)
            return DummyResponse()

        created_threads = []

        def thread_factory(*_args, **kwargs):
            thread = ImmediateThread(**kwargs)
            created_threads.append(thread)
            return thread

        self.runtime.play_notification = fake_notification
        self.runtime.urllib.request.urlopen = fake_urlopen
        self.runtime.threading.Thread = thread_factory

        self.runtime.start_gradio_live_monitor("https://example.com", DummyProcess())
        self.assertTrue(created_threads, "monitor thread was not started")
        self.assertTrue(created_threads[0].started, "monitor thread did not start")
        self.assertEqual(len(notification_calls), 1, "notification was not triggered")

    def test_monitor_exits_when_process_terminates(self):
        self.runtime.DRY_RUN = False
        notification_calls = []

        def fake_notification():
            notification_calls.append(True)

        urlopen_called = []

        def fake_urlopen(url, timeout=10):
            urlopen_called.append(True)
            raise AssertionError("urlopen should not be invoked when process already ended")

        created_threads = []

        def thread_factory(*_args, **kwargs):
            thread = ImmediateThread(**kwargs)
            created_threads.append(thread)
            return thread

        self.runtime.play_notification = fake_notification
        self.runtime.urllib.request.urlopen = fake_urlopen
        self.runtime.threading.Thread = thread_factory

        self.runtime.start_gradio_live_monitor("https://example.com", DummyProcess(poll_result=0))
        self.assertTrue(created_threads, "monitor thread was not started")
        self.assertTrue(created_threads[0].started, "monitor thread did not start")
        self.assertFalse(notification_calls, "notification should not run when process ends early")
        self.assertFalse(urlopen_called, "urlopen should not run when process already finished")


if __name__ == "__main__":
    unittest.main()
