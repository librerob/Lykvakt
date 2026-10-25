# Background research

Background notes; some options discussed here are not part of the current build.

The original review took place on 24 October 2026. These notes explain design questions, not implemented compatibility or current claims about other products. No new competitor audit is implied by this documentation update.

## Formats and recovery

The [Aegis vault specification](https://github.com/beemdevelopment/Aegis/blob/master/docs/vault.md) and [FAQ](https://github.com/beemdevelopment/Aegis/blob/master/FAQ.md) were useful references for separating encrypted export formats from portable account data, and for treating device loss and password loss as recovery questions.

The [Ente export documentation](https://help.ente.io/auth/migration/export) illustrates why a published encrypted format is not sufficient evidence of implemented interoperability. Lykvakt accepts supported standard OTP data; additional encrypted adapters need versioned fixtures and restoration tests before support is claimed.

[2FAuth’s data-protection documentation](https://docs.2fauth.app/security/data-protection/) informed recovery questions about separately held keys and backups. Browser-local encryption removes server operation from this project’s scope, but does not create a password-reset mechanism.

The original review also consulted an [Authenticator-Extension advisory](https://github.com/Authenticator-Extension/Authenticator/security/advisories/GHSA-gv8m-vgp8-q2xr) when considering versioned password encoding and legacy fixtures. That is a design reference, not a claim about the present security of another application.

Google transfer decoding follows the [published protobuf schema in Aegis](https://github.com/beemdevelopment/Aegis/blob/master/app/src/main/proto/google_auth.proto). Synthetic tests and bounded parsing establish specific behavior; they do not establish exhaustive phone interoperability.

## Product scope and evidence

The implemented choices are a password-encrypted offline vault, explicit previewed imports, and restoration testing against the actual saved file. Account-loss anecdotes and feature lists do not establish comparative security or usability. No market-superiority claim is made.

Keep OTP counters and parameters exact, verify migrations against another authenticator, and do not suggest reinstalling as a recovery step when it could remove the only working copy.

## Working identity

Lykvakt is a coined Nordic-inspired working name. No trademark clearance is claimed. The original angular lock uses shock pink `#ff1683` and near-black `#080608`; the current interface has one true-black and pink appearance.
