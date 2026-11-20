# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately instead:

- If the repository is hosted on GitHub, use **Security → Report a vulnerability** (private
  vulnerability reporting) on the repository page.
- Otherwise, contact the maintainers directly through the channel you received the project from.

Please include:

- what you found and where (endpoint, page or file);
- steps to reproduce it, with any request and response involved;
- the impact you expect (for example, "a customer can read another customer's receipt");
- the version or commit you tested.

Please do not access, change or delete data that is not yours, and do not run denial-of-service or
automated load tests against a deployment you do not own.

## What to expect

This project does not publish a response-time commitment. Reports are read by the maintainers, and a
confirmed issue is fixed and recorded in the audit and test suites where it applies.

## Supported versions

Only the current code on the main branch (version `2.0.0` in `package.json`) is maintained. There are no
release branches.

## What the project already does

The measures in place, how they are tested and what is knowingly left open are described in
[docs/security.md](docs/security.md). Operators should also read the production section of
[docs/deployment.md](docs/deployment.md): TLS and HSTS are the job of the proxy in front of the stack,
and the demo accounts created by `npm run db:seed` are for development only (the seed refuses to run in
production).

## Scope

In scope: the API (`apps/api`), the web app (`apps/web`), the shared package and the Docker and nginx
configuration in this repository.

Out of scope: a deployment's own infrastructure and configuration, third-party services such as an SMTP
provider, and findings that need a privileged or already compromised account without crossing a
permission boundary.
