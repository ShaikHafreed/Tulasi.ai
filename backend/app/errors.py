from .models.schemas import ErrorDetail


class AppError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        error_code: str,
        human_message: str,
        suggested_action: str,
    ) -> None:
        self.status_code = status_code
        self.detail = ErrorDetail(
            error_code=error_code,
            human_message=human_message,
            suggested_action=suggested_action,
        )
        super().__init__(human_message)
