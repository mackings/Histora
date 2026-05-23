package appctx

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type authUserKey struct{}

type AuthUser struct {
	ID       bson.ObjectID
	Email    string
	Username string
}

func WithAuthUser(ctx context.Context, user AuthUser) context.Context {
	return context.WithValue(ctx, authUserKey{}, user)
}

func AuthUserFromContext(ctx context.Context) (AuthUser, bool) {
	user, ok := ctx.Value(authUserKey{}).(AuthUser)
	return user, ok
}
