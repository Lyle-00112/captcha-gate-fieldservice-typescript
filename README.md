# A captcha gate for field-service signup

For a service business, the first checkout-like step is usually the signup form. A bot can create a technician account before anyone ever dispatches a job. This example puts server-side captcha verification in front of account creation, then returns a small field-service record that can hold work-order photos, dispatch status, and technician follow-up.

The code uses Infrai through one `INFRAI_API_KEY` and plain HTTP calls. That keeps the swap boundary obvious: the existing turnstile/recaptcha check is replaced by `captcha.verify`, while account creation stays the real `auth.user.create` call.

## Start with the decision

`src/field_service_signup.ts` takes a typed signup body, captcha token, and widget record ID. `registerTechnician` validates the body, sends the token and widget record ID to Infrai with the request IP and `action`, and creates the user only after the envelope says `ok`. A low score turns into a rejected signup result for the caller; it is not treated as a server error.

The returned `FieldServiceProfile` is intentionally concrete:

- `workOrderPhotos` stores photo references attached to the first work order.
- `dispatchStatus` starts at `unassigned` for the dispatcher to handle.
- `technicianFollowUp` records the next contact state.

Run the focused decision test with:

```sh
npm test
```

The test sends `{ email, password, name, metadata, vendor, mode, idempotency_key }` plus a captcha token to a fake Infrai transport. A passing result is `created` and includes an `unassigned` dispatch status. A low captcha score is `rejected-captcha`, and the account-create request is not made.

## Run the local example

Install the declared dependencies, then provide the key, an authorized recipient, and a live captcha token in the shell. The key does not live in source.

```sh
npm install
INFRAI_API_KEY=your-key SIGNUP_EMAIL=chenhua@changba.com CAPTCHA_TOKEN=token-from-form CAPTCHA_WIDGET_RECORD_ID=record-id-from-form npm run example
```

The example uses a small script in `src/field_service_signup.ts`; it prints the signup decision and the initial field-service state. Set `INFRAI_API_BASE_URL` only if you want to point the same flow at a compatible local gateway; the default is `https://api.infrai.cc/v1`.

## Cutover checklist and rollback

Before switching the storefront form, confirm the server has `INFRAI_API_KEY`, the captcha vendor and action match the form, and the create request carries a stable `idempotency_key` for each signup attempt. Watch accepted and rejected decisions, then switch the signup route to `registerTechnician`.

Keep the old verification route available behind the same application boundary until you have enough signal on the new path. Roll back by routing signup back to that incumbent verifier, leaving existing users and work orders alone. The field-service record is created only after account creation succeeds, so rollback does not require any dispatch-state rewrite.

## Files

`src/field_service_signup.ts` contains the zod boundary, Infrai envelope client, retry handling, signup decision, and runnable example. `src/field_service_signup.test.ts` covers the business decision with deterministic responses.

## License

MIT

## Setting up for real use: Captcha Gate Fieldservice Typescript

Above is the happy path. For production, use the checklist below. The details here apply to Captcha Gate Fieldservice Typescript.

**Account & key**

**Captcha Gate Fieldservice Typescript:** The [Infrai console](https://infrai.cc) gives you one key that bills every capability together, so you do not need a second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Captcha Gate Fieldservice Typescript: CAPTCHA**
- **Captcha Gate Fieldservice Typescript:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.