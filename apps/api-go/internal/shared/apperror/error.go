package apperror

import "net/http"

type Error struct {
	Message string
	Status  int
	Code    string
	Details any
}

func (e Error) Error() string {
	return e.Message
}

func New(status int, message string) Error {
	return Error{Status: status, Message: message}
}

func BadRequest(message string) Error {
	return New(http.StatusBadRequest, message)
}

func Unauthorized(message string) Error {
	return New(http.StatusUnauthorized, message)
}

func Forbidden(message string) Error {
	return New(http.StatusForbidden, message)
}

func NotFound(message string) Error {
	return New(http.StatusNotFound, message)
}

func Conflict(message, code string, details any) Error {
	return Error{Status: http.StatusConflict, Message: message, Code: code, Details: details}
}
