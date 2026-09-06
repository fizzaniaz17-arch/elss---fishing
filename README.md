# ELSS Prototype

A local academic prototype of a Fishing Vessel Electronic Logbook System for FV Ocean Guardian. It is a simulation: it does not contact UK Fisheries, send email, or use production credentials or PGP keys.

## Run

Requires Node.js 18+. From this folder:

```bash
npm start
```

Open http://localhost:3000. Demo user: `MASTER001` (Master). Data is stored in browser localStorage; use Settings to reset it. Tests run with `npm test` (the prototype is intentionally dependency-free).

## Demonstration

Use Create Report to capture FAR/TRA/LAN data, view the generated GBRRN filename and XML, then send it from the report or Transmission Centre. The Electronic Logbook page supports create, read, edit, and delete actions. A simulated success acknowledgement is correlated automatically. Test Mode exposes failed, negative, unmatched-acknowledgement, partial-correction rejection, frequency, correction, and DEMO/TEST-key encryption scenarios. Corrections copy the full original report and are marked COR. Requirement Traceability maps all ten selected requirements to visible features and test IDs.

## Architecture and assumptions

`server.js` serves the responsive single-page UI. `public/app.js` contains the separated demo services for validation, UTC timestamps, GBRRN/XML generation, encryption/transmission simulation, acknowledgement correlation, correction workflow, frequency rules, and audit events. `public/styles.css` provides the maritime operational UI. SQLite/Prisma and external ERS integration are intentionally omitted to keep local setup zero-configuration; browser storage is the demo persistence layer. This is not a production regulatory system.
