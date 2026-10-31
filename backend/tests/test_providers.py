from app.providers import _is_question_echo, ask_ollama


def test_detects_an_answer_that_repeats_the_question():
    assert _is_question_echo("What should I do to increase sales?", "What should I do to increase sales?")
    assert _is_question_echo("Sales?", "Sales?")


def test_keeps_a_direct_answer_that_does_not_repeat_the_question():
    assert not _is_question_echo(
        "Who owes me money?",
        "Recorded pending customer dues total ₹500 across one record: Mr Suresh ₹500.",
    )
    assert not _is_question_echo(
        "What should I do to increase sales?",
        "Start by checking which products have the strongest recorded demand.",
    )


def test_retries_an_echo_and_returns_the_model_correction(monkeypatch):
    question = "What should I do to increase sales?"
    replies = iter([question, "Check stock levels and promote products that sell well."])
    monkeypatch.setattr("app.providers._ollama_chat", lambda *args, **kwargs: next(replies))

    answer = ask_ollama(question, {}, "en")

    assert answer == "Check stock levels and promote products that sell well."


def test_does_not_return_a_second_echo(monkeypatch):
    question = "What should I do to increase sales?"
    monkeypatch.setattr("app.providers._ollama_chat", lambda *args, **kwargs: question)

    answer = ask_ollama(question, {}, "en")

    assert answer != question
    assert "couldn't form a reliable answer" in answer
