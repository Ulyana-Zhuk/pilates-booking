# Pilates Booking

Small web app for registering to pilates classes, with an admin panel for managing the schedule.
Dependency-free Node.js server (Node 18+) with JSON-file storage.

## Run

```bash
ADMIN_PASSWORD=choose-a-password npm start
```

- Booking page: http://localhost:3000
- Admin panel: http://localhost:3000/admin.html

If `ADMIN_PASSWORD` is not set, a random password is generated and printed at startup.
`PORT` overrides the default port (3000).

## Features

- Browse upcoming classes, see spots left, book with name and email
- Look up and cancel your bookings by email
- Admin: log in, add / edit / delete classes, see who is registered

## Data

On first run the server creates `data.json` with two weeks of sample classes (see `seed()` in `server.js`).
It holds registrants' personal data and is git-ignored. Delete it to reset.

## Limitations

- Single shared admin password, no per-user accounts
- Plain HTTP — put it behind HTTPS before exposing it publicly
- Bookings are identified by email only (no verification)
