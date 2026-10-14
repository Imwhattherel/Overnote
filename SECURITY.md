# Security and privacy

Overnote handles personal notes and optional backup credentials. **Don't submit real credentials or note databases in GitHub issues.** Reproduce issues with dummy data.

## Files that belong only on your computer

Overnote deliberately keeps existing user data in `%APPDATA%\sticky-notes` to avoid losing notes during upgrades. That folder can contain `notes.json`, `backup-credentials.enc`, reminders, backup archives and custom sounds. Do not copy it into the public repository.

Remote backup files contain personal note contents. Use private Discord channels or private GitHub backup repositories and limit your tokens to the minimum permissions necessary. If a credential is accidentally published, immediately revoke or rotate it; deleting it from the repository is insufficient because Git history may still contain it.

The provided Windows runtime is unsigned, and setting `author` to `whattherel` does not change the operating system's security verification. To identify the publisher to Windows, sign each executable and installer with a suitable trusted Authenticode certificate.

## Locked notes

Overnote encrypts the body of password-locked notes with a password-derived AES-256-GCM key. Reminder text, titles and other metadata are not encrypted. A forgotten password cannot be recovered. Unlocked content is present in memory until the note is relocked or the app exits. Do not commit local `notes.json` files, backup credentials, backups or alarm sounds.

Images are embedded in Markdown as base64, increasing note and backup sizes; shared Markdown/PDF files can disclose image content.

Overnote 2.1.2 adds optional automatic re-locking of unlocked password-protected notes after 1, 5, 15, 30, or 60 minutes without Overnote input. This is off by default; enabled mode also relocks on Windows screen lock and suspend. This is an application convenience feature, not full-disk encryption. Note titles and reminder excerpts are not encrypted.
