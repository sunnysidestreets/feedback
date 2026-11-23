/**
 * Sunnyside Street Safety: Neighbor Feedback
 * Google Apps Script backend. Lives inside the form's response spreadsheet
 * (Extensions → Apps Script). The website itself is hosted on GitHub Pages;
 * this script is the small web service it talks to for votes and comments.
 *
 * Sheets this script uses:
 *   Form Responses 1   (made by Google Forms) + your columns:
 *                      Approved (checkbox) · Title · Outside project (checkbox) · Image link
 *   Votes              created automatically: one row per browser per card
 *   Comments           created automatically: tick "Hide" to take a comment down
 *   Flags              created automatically: one row per browser per flagged item
 */

const CONFIG = {
  PAGE_TITLE: "Sunnyside Street Safety: Neighbor Feedback",
  FORM_SHEET_NAME: "",          // leave blank to use the first sheet named "Form Responses…"
  FLAG_HIDE: 3,                 // flags from different browsers before an item is hidden
  MAX_COMMENTS_PER_HOUR: 10     // per browser
};

/* ------------------------------------------------------------ web service
   GET  ?action=getData&b=<browser id>      → everything the page needs
   POST {"action":"vote"|"addComment"|"flag", "args":[...]}  (sent as text/plain)
--------------------------------------------------------------------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "getData") return json_(getData(p.b));
  return json_({ ok: true, service: CONFIG.PAGE_TITLE });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: "Bad request." }); }
  const actions = { vote: vote, addComment: addComment, flag: flag };
  const fn = actions[body && body.action];
  if (!fn) return json_({ error: "Unknown action." });
  const args = Array.isArray(body.args) ? body.args.slice(0, 3) : [];
  try { return json_(fn.apply(null, args)); }
  catch (err) { return json_({ error: "Something went wrong. Please try again." }); }
}

/* --------------------------------------------------------------- helpers */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, headers) {
  let sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sh;
}

function votesSheet_()    { return sheet_("Votes",    ["Browser", "Card", "Vote", "Updated"]); }
function commentsSheet_() {
  const sh = sheet_("Comments", ["ID", "Card", "Comment", "Posted", "Browser", "Hide"]);
  return sh;
}
function flagsSheet_()    { return sheet_("Flags",    ["Browser", "Item", "Flagged"]); }

function formSheet_() {
  if (CONFIG.FORM_SHEET_NAME) return ss_().getSheetByName(CONFIG.FORM_SHEET_NAME);
  return ss_().getSheets().find(s => /form responses/i.test(s.getName())) || ss_().getSheets()[0];
}

function table_(sh) {
  const values = sh.getDataRange().getValues();
  const header = values.shift() || [];
  return { header: header.map(h => String(h).trim()), rows: values };
}

function col_(header, re) { return header.findIndex(h => re.test(h)); }

function iso_(v) { return v instanceof Date ? v.toISOString() : String(v || ""); }

function cleanId_(s) { return String(s || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 80); }

function isTrue_(v) { return v === true || String(v).toUpperCase() === "TRUE"; }

// Turns a Google Drive share link into a picture the page can show.
// The file must be shared as "Anyone with the link can view".
function driveImage_(link) {
  link = String(link || "").trim();
  if (!link) return "";
  const m = link.match(/\/d\/([A-Za-z0-9_-]{20,})/) || link.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  return m ? "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1600" : "";
}

const BLOCKLIST = ["idiot", "moron", "stupid", "dumbass", "asshole", "bitch", "fuck", "shit", "retard", "kill yourself"];

function checkText_(text, minLen) {
  const t = String(text || "").trim();
  if (t.length < minLen) return "Please add a bit more detail (at least " + minLen + " characters).";
  if (t.length > 800) return "Please keep comments under 800 characters.";
  if (/(https?:\/\/|www\.|\.com\b|\.org\b|\.net\b)/i.test(t)) return "Please leave out links (community agreement 4).";
  if (/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(t) || /[\w.+-]+@[\w-]+\.[\w.]+/.test(t))
    return "Please leave out phone numbers and email addresses (community agreement 4).";
  const low = t.toLowerCase();
  if (BLOCKLIST.some(w => low.includes(w))) return "Please keep it about the street, not people (community agreement 2).";
  return null;
}

/* ------------------------------------------------- called from the page */

function getData(browserId) {
  browserId = cleanId_(browserId);
  const out = { counts: {}, myVotes: {}, comments: [], reports: [], flags: {}, myFlags: {} };

  table_(votesSheet_()).rows.forEach(r => {
    const vid = String(r[0]), pid = String(r[1]), v = String(r[2]);
    if (!pid || !["up", "unsure", "down"].includes(v)) return;
    const c = out.counts[pid] || (out.counts[pid] = { up: 0, unsure: 0, down: 0 });
    c[v]++;
    if (vid === browserId) out.myVotes[pid] = v;
  });

  table_(flagsSheet_()).rows.forEach(r => {
    const item = String(r[1]);
    out.flags[item] = (out.flags[item] || 0) + 1;
    if (String(r[0]) === browserId) out.myFlags[item] = true;
  });

  table_(commentsSheet_()).rows.forEach(r => {
    if (!r[0] || isTrue_(r[5])) return;
    out.comments.push({ id: String(r[0]), pid: String(r[1]), text: String(r[2]), at: iso_(r[3]), who: "Neighbor" });
  });

  const fs = formSheet_();
  if (fs) {
    const t = table_(fs), h = t.header;
    const iTime = col_(h, /^timestamp$/i), iLoc = col_(h, /location/i), iProb = col_(h, /problem/i),
          iApp = col_(h, /^approved$/i), iTitle = col_(h, /^title$/i),
          iOut = col_(h, /^outside project$/i), iImg = col_(h, /^image link$/i);
    if (iApp >= 0 && iLoc >= 0 && iProb >= 0) {
      t.rows.forEach((r, k) => {
        if (!isTrue_(r[iApp])) return;
        const ts = iTime >= 0 ? r[iTime] : "";
        const where = String(r[iLoc] || "").trim();
        out.reports.push({
          id: "rep-" + (ts instanceof Date ? ts.getTime() : "row" + (k + 2)),
          title: (iTitle >= 0 && String(r[iTitle]).trim()) || where,
          where: where,
          text: String(r[iProb] || "").trim(),
          at: iso_(ts),
          outside: iOut >= 0 && isTrue_(r[iOut]),
          image: iImg >= 0 ? driveImage_(r[iImg]) : ""
        });
      });
    }
  }
  return out;
}

// choice: "up" | "unsure" | "down" | "" (remove vote)
function vote(browserId, cardId, choice) {
  browserId = cleanId_(browserId); cardId = cleanId_(cardId); choice = String(choice || "");
  if (!browserId || !cardId || !["up", "unsure", "down", ""].includes(choice)) return { error: "Bad vote." };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = votesSheet_(), values = sh.getDataRange().getValues();
    for (let i = values.length - 1; i >= 1; i--) {
      if (String(values[i][0]) === browserId && String(values[i][1]) === cardId) {
        if (choice) sh.getRange(i + 1, 3, 1, 2).setValues([[choice, new Date()]]);
        else sh.deleteRow(i + 1);
        return { ok: true };
      }
    }
    if (choice) sh.appendRow([browserId, cardId, choice, new Date()]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function addComment(browserId, cardId, text) {
  browserId = cleanId_(browserId); cardId = cleanId_(cardId);
  if (!browserId || !cardId) return { error: "Something went wrong. Please reload the page." };
  const err = checkText_(text, 10);
  if (err) return { error: err };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = commentsSheet_(), hourAgo = Date.now() - 3600 * 1000;
    const recent = table_(sh).rows.filter(r => String(r[4]) === browserId && r[3] instanceof Date && r[3].getTime() > hourAgo).length;
    if (recent >= CONFIG.MAX_COMMENTS_PER_HOUR) return { error: "That's a lot of comments in one hour. Please try again later." };
    const id = "c-" + Utilities.getUuid();
    sh.appendRow([id, cardId, String(text).trim(), new Date(), browserId, false]);
    sh.getRange(sh.getLastRow(), 6).insertCheckboxes();
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

function flag(browserId, itemId) {
  browserId = cleanId_(browserId); itemId = cleanId_(itemId);
  if (!browserId || !itemId) return { error: "Bad flag." };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = flagsSheet_();
    const already = table_(sh).rows.some(r => String(r[0]) === browserId && String(r[1]) === itemId);
    if (!already) sh.appendRow([browserId, itemId, new Date()]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* Run this once from the editor (select "setup" → Run) to create the
   Votes, Comments and Flags tabs and grant permissions. */
function setup() {
  votesSheet_(); commentsSheet_(); flagsSheet_();
  const fs = formSheet_();
  const h = fs ? table_(fs).header : [];
  const missing = ["Approved", "Title", "Outside project", "Image link"]
    .filter(name => !h.some(x => x.toLowerCase() === name.toLowerCase()));
  Logger.log(missing.length ? "Add these columns to " + fs.getName() + ": " + missing.join(", ")
                            : "All set. Form sheet: " + fs.getName());
}
