from s3_cleanup import collect_book_s3_keys


def test_collect_book_s3_keys_primary_and_extras():
    keys = collect_book_s3_keys(
        s3_key="books/u1/a/book.pdf",
        extras={"preview": {"s3_key": "books/u1/a/preview.png"}, "tags": ["x"]},
    )
    assert keys == ["books/u1/a/book.pdf", "books/u1/a/preview.png"]
