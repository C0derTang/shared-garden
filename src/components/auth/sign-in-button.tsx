export function SignInButton() {
  return (
    <form action="/auth/start" method="post" className="auth-form">
      <button type="submit" className="button button-primary">
        Continue with Google
      </button>
    </form>
  );
}
