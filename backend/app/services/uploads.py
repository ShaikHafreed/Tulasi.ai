from ..errors import AppError

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}
MAX_BYTES = 100 * 1024 * 1024


def validate_content_type(content_type: str | None) -> None:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise AppError(
            status_code=400,
            error_code="unsupported_file_type",
            human_message="Only JPEG or PNG photos are supported.",
            suggested_action="Upload a .jpg or .png photo of the object.",
        )


def validate_size(size: int) -> None:
    if size > MAX_BYTES:
        raise AppError(
            status_code=400,
            error_code="file_too_large",
            human_message="That photo is too large.",
            suggested_action="Upload a photo under 100MB.",
        )
