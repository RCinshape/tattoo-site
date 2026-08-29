# WhatsApp message templates

Verbatim dump of the two templates the enquiry pipeline sends, taken from
`GET /v25.0/{waba-id}/message_templates` on the Cloud API **sandbox** WABA
`1007546925675920`, where both are live and `APPROVED`. Recreate them exactly as
written here on Emmy's production WABA — `functions/api/enquiry.js` sends
positional parameters and will break on any change to the count or order.

Which one is sent is decided per enquiry in `functions/api/enquiry.js`: the
photo template when the collage uploaded and `WA_TEMPLATE_PHOTOS` is set,
otherwise the plain one. Both must exist.

| | `tattoo_enquiry_photos_v1` | `tattoo_enquiry_v1` |
|---|---|---|
| Binding | `WA_TEMPLATE_PHOTOS` | `WA_TEMPLATE_PLAIN` |
| Header | **IMAGE** (the collage) | none |
| Body / footer / button | identical | identical |
| Category | UTILITY | UTILITY |
| Language | en_GB | en_GB |
| Parameter format | POSITIONAL | POSITIONAL |
| Sandbox template id | 2596798904056579 | 1587404913177201 |

Sandbox ids are recorded for traceability only; production will mint its own.

## Body text

Byte-identical in both templates: **269 characters, 11 lines**, LF only, no tabs.

```text
Hi {{1}} — thanks for your enquiry. Here it is, so you and Emmy both have it in one place. She'll reply in this chat.

Idea: {{2}}
Placement: {{3}}
Size: {{4}}
Budget: {{5}}
When suits: {{6}}
Email: {{7}}
Reference link: {{8}}

Tap "Yes, that's right" below to confirm.
```

### Characters that must survive copy-paste

The body contains exactly **one** non-ASCII character. Everything else is plain
ASCII — in particular every apostrophe and double quote is straight, not curly.
Word processors and some editors silently "smarten" these; if that happens the
template still creates, but the copy no longer matches what shipped.

| Character | Codepoint | Where |
|---|---|---|
| `—` em dash | U+2014 | `Hi {{1}} — thanks for your enquiry` |
| `'` apostrophe | U+0027 (straight) | `She'll reply`, `that's right` (×2) |
| `"` double quote | U+0022 (straight) | around `"Yes, that's right"` in the last line |

### Why it ends on a static line

Meta refuses to create a template whose text begins or ends with a variable:

> `code 100`, `error_subcode 2388299` — *"Leading or Trailing Params Not Allowed — Variables can't be at the start or end of the template."*

An earlier draft ended on `Reference link: {{8}}` and was rejected outright. The
closing line is not filler: an API-sent message is **outgoing**, so it never
buzzes Emmy's phone, whereas the client tapping the quick reply is a real
inbound message that does — and it opens the free 24-hour window in which every
later reply costs nothing.

## Footer

No variables are permitted in a footer.

```text
emmytattoo.com
```

## Buttons

One button, type **QUICK_REPLY**, text exactly (17 characters):

```text
Yes, that's right
```

No URL button: Meta policy forbids `wa.me` links in call-to-action buttons, and
there is nothing else worth linking.

## Parameter order

Positional, `{{1}}`–`{{8}}`, in the order `onRequestPost` builds them. The left
column is the template variable; the right columns are where the value comes
from in `index.html`.

| Var | Form field (`name=`) | Input id | Required | Control | Approval sample |
|---|---|---|---|---|---|
| `{{1}}` | `name` | `#bkf-name` | required | text | `Emma` |
| `{{2}}` | `idea` | `#bkf-idea` | required | textarea | `fine line fox on the inner forearm` |
| `{{3}}` | `placement` | `#bkf-place` | optional | text | `Inner forearm` |
| `{{4}}` | `size` | `#bkf-size` | optional | text | `About 12cm` |
| `{{5}}` | `budget` | `#bkf-budget` | optional | select | `150-300` |
| `{{6}}` | `when` | `#bkf-when` | optional | text | `Weekday mornings` |
| `{{7}}` | `email` | `#bkf-email` | optional | email | `emma@example.com` |
| `{{8}}` | `refs` | `#bkf-refs` | optional | text | `instagram.com/p/abc123` |

Every value passes through `p()` before sending, which collapses all runs of
whitespace to single spaces and substitutes an em dash `—` (U+2014) for anything
blank. Two rules force this, both confirmed live rather than read from docs:

- A parameter may not contain a newline, a tab, or more than four consecutive
  spaces. Sent raw, Meta returns `400 132018` — *"Param text cannot have
  new-line/tab characters or more than 4 consecutive spaces"*. This is why the
  multi-line "idea" textarea arrives as one line.
- A parameter may not be empty, which is why unfilled optionals arrive as `—`
  rather than `""`.

Optional fields are therefore never omitted — all eight parameters are always
sent, in this order.

## Recreating them on Emmy's WABA

Category, language and parameter order must match; Meta honoured the requested
`UTILITY` category on both. Utility is roughly £0.0159 per message against
£0.0382 for marketing, and these qualify because they confirm something the user
just requested and carry no offer, upsell or promotional call to action.

### The IMAGE header's approval sample

`tattoo_enquiry_photos_v1` needs a sample image for review, and it is **not** a
`/{phone-number-id}/media` upload. It comes from the resumable upload API, and
the handle is specific to the app that produced it — the `header_handle` value
in a template dump is a `scontent.whatsapp.net` URL that **cannot** be replayed
into a create call. Generate a fresh one:

```
POST https://graph.facebook.com/v25.0/{app-id}/uploads
     ?file_length={bytes}&file_type=image/jpeg
     Authorization: OAuth {token}
  -> { "id": "upload:..." }

POST https://graph.facebook.com/v25.0/{upload-session-id}
     Authorization: OAuth {token}
     file_offset: 0
     body: the raw image bytes
  -> { "h": "..." }        <- this is the header_handle
```

Any real tattoo photo works; a Meta reviewer sees it.

### Create calls

`POST https://graph.facebook.com/v25.0/{waba-id}/message_templates` with
`Authorization: Bearer {token}` and `Content-Type: application/json`. The token
needs `whatsapp_business_management`.

`tattoo_enquiry_photos_v1`:

```json
{
  "name": "tattoo_enquiry_photos_v1",
  "language": "en_GB",
  "category": "UTILITY",
  "components": [
    {
      "type": "HEADER",
      "format": "IMAGE",
      "example": {
        "header_handle": [
          "<PASTE THE h VALUE FROM THE RESUMABLE UPLOAD — see below>"
        ]
      }
    },
    {
      "type": "BODY",
      "text": "Hi {{1}} — thanks for your enquiry. Here it is, so you and Emmy both have it in one place. She'll reply in this chat.\n\nIdea: {{2}}\nPlacement: {{3}}\nSize: {{4}}\nBudget: {{5}}\nWhen suits: {{6}}\nEmail: {{7}}\nReference link: {{8}}\n\nTap \"Yes, that's right\" below to confirm.",
      "example": {
        "body_text": [
          [
            "Emma",
            "fine line fox on the inner forearm",
            "Inner forearm",
            "About 12cm",
            "150-300",
            "Weekday mornings",
            "emma@example.com",
            "instagram.com/p/abc123"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "emmytattoo.com"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "QUICK_REPLY",
          "text": "Yes, that's right"
        }
      ]
    }
  ]
}
```

`tattoo_enquiry_v1`:

```json
{
  "name": "tattoo_enquiry_v1",
  "language": "en_GB",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}} — thanks for your enquiry. Here it is, so you and Emmy both have it in one place. She'll reply in this chat.\n\nIdea: {{2}}\nPlacement: {{3}}\nSize: {{4}}\nBudget: {{5}}\nWhen suits: {{6}}\nEmail: {{7}}\nReference link: {{8}}\n\nTap \"Yes, that's right\" below to confirm.",
      "example": {
        "body_text": [
          [
            "Emma",
            "fine line fox on the inner forearm",
            "Inner forearm",
            "About 12cm",
            "150-300",
            "Weekday mornings",
            "emma@example.com",
            "instagram.com/p/abc123"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "emmytattoo.com"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "QUICK_REPLY",
          "text": "Yes, that's right"
        }
      ]
    }
  ]
}
```

`example.body_text` is required — creation fails without eight sample values.

### After creating

Both come back `PENDING`. Approval is **not** instant: on the sandbox the photo
template took about ten minutes and the plain one longer. Until a template is
`APPROVED`, sending it fails with `404 132001 Template name does not exist in
the translation`, which is indistinguishable from a typo in `WA_TEMPLATE_*`.
Check state before debugging the function:

```
GET https://graph.facebook.com/v25.0/{waba-id}/message_templates?fields=name,status,category,language
```

Then set `WA_TEMPLATE_PHOTOS=tattoo_enquiry_photos_v1`,
`WA_TEMPLATE_PLAIN=tattoo_enquiry_v1` and `WA_LANG=en_GB` in the Pages
project's variables.
