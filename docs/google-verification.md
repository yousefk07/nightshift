# Google OAuth verification: what to submit

Nightshift asks Google for these permissions (lib/connectors/oauth.ts):

| Scope | Google's class | What it's for |
|---|---|---|
| `openid`, `email` | basic | Know which Google account was connected |
| `https://www.googleapis.com/auth/gmail.modify` | **restricted** | Read new mail, label it, create drafts, send replies the owner approves |
| `https://www.googleapis.com/auth/calendar.events` | sensitive | Read the calendar, find free times, add events the owner approves |
| `https://www.googleapis.com/auth/spreadsheets.readonly` | sensitive | Read a lead list the owner points to |

Reading mail needs a restricted scope (there's no non-restricted way to read Gmail), so Nightshift needs **brand verification + sensitive/restricted scope verification + a CASA security assessment** (renewed every year).

## 1. Branding (Google Auth Platform → Branding)

- App name: **Nightshift**
- Support email: admin@nightshiftai.ca (must be an address you can receive at)
- App logo: 120×120 PNG, the bot on the gold tile (`public/icon.png`, resized)
- Home page: https://www.nightshiftai.ca
- Privacy policy: https://www.nightshiftai.ca/legal/privacy
- Terms of service: https://www.nightshiftai.ca/legal/terms
- Authorized domains: `nightshiftai.ca` (verify it in Google Search Console first, as the owner of the Google Cloud project)

## 2. Scope justifications (Data Access → each scope)

**gmail.modify**
> Nightshift is an assistant for small businesses. Its inbox bot reads new emails in the user's mailbox to tell them what needs attention, applies labels (for example "Receipts" or "Waiting") to organise the inbox, and writes draft replies in the user's voice. When the user approves a draft inside Nightshift, Nightshift sends it from their mailbox, in the same thread. gmail.modify is the narrowest scope that allows reading, labelling, drafting and sending together; Nightshift never deletes email. Nothing is sent without the user's approval unless the user explicitly allows a specific bot to send on its own.

**calendar.events**
> Nightshift reads the user's calendar to include today's meetings in their morning brief and to offer real free times when drafting replies to people who want to meet. When the user approves it, Nightshift adds the agreed event to their calendar. It doesn't change or delete existing events.

**spreadsheets.readonly**
> Users who keep their customer or lead list in a Google Sheet paste the sheet's link into Nightshift; Nightshift reads its rows (name, email, company, stage, last contacted) so the follow-up bot knows who to follow up with. It only reads, and only sheets the user points to.

## 3. The demo video (unlisted YouTube link)

Record in English, one take, about 3–4 minutes, showing the real app at www.nightshiftai.ca:

1. The home page, then sign in.
2. Settings → Connections → Email → Google. Show the **Google consent screen**, zoom on the app name "Nightshift" and the list of permissions, and the URL bar (the OAuth client ID must be visible in the URL).
3. Back in Nightshift: the inbox bot runs. Show it **reading** new mail (its summary in the bot room / chat), **labelling** a message (show the label in Gmail), and a **draft** appearing (show it in Gmail's Drafts).
4. Approve a draft in Nightshift and show it **sent** in Gmail's Sent folder.
5. Calendar: the morning brief listing today's meetings; a draft offering free times; approve an event and show it in Google Calendar.
6. Sheets: paste a sheet link in Connections → CRM or lead list, show the contacts imported.
7. Disconnect Google in Settings → Connections, and show the Privacy Policy's Google section.

## 4. CASA security assessment

Restricted scopes need a Cloud Application Security Assessment (Tier 2) from a lab authorised by the App Defense Alliance. Google emails you the next steps after reviewing the scopes. Costs and timelines vary by lab; get quotes from two. Things the assessor will ask for that Nightshift already does: TLS everywhere, tokens encrypted at rest (AES-GCM), access control per workspace and role, least-privilege scopes, logging (error_log, activity log), and deletion on request (workspace deletion, 30 days).

## 5. Before submitting: the open risk

Google's Limited Use rules forbid transferring Google user data to a third party that uses it to train AI models. Gmail content is sent to **DeepSeek** to draft replies. **Check DeepSeek's current API terms on whether API inputs are used for training**, and keep proof (their policy page) for the reviewer. If DeepSeek may train on API data, switch Google-connected tasks to a provider whose API terms rule that out before submitting, or Google will likely reject the app.

## While verification runs

Up to 100 test users can use the app in Testing mode: add them under Google Auth Platform → Audience → Test users.
