/**
 * ==============================================================================
 * MINDSHARE GOOGLE DRIVE AUTO-BACKUP (STYLE 2: DEDICATED FILE PER USER)
 * ==============================================================================
 * 
 * INSTRUCTIONS:
 * 1. Go to https://script.google.com and click "New project".
 * 2. Paste this entire code into the editor (replace any existing code).
 * 3. Click "Deploy" (top right) -> "New deployment".
 * 4. Select type: "Web app".
 * 5. Set:
 *    - Description: "Mindshare Google Drive Backup"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone"
 * 6. Click "Deploy", authorize permissions, and copy the "Web app URL".
 * 7. Paste that Web app URL into your Mindshare .env.local as:
 *    GOOGLE_SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/.../exec"
 *    (or trigger directly from the Mindshare UI)
 * 
 * WHAT THIS SCRIPT DOES AUTOMATICALLY:
 * - Creates a folder in your Google Drive named "Mindshare User Backups".
 * - For EVERY user (existing clients and any newly joined user):
 *   Creates an individual Google Sheet file named "Mindshare_@<username>".
 * - Automatically refreshes all thoughts, timestamps, tags, mentions, and media URLs.
 * - Formats headers with bold styling, freezing top row, and auto-sized columns.
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({ error: "No post data received" });
    }

    const payload = JSON.parse(e.postData.contents);
    const users = payload.users || [];

    if (!Array.isArray(users) || users.length === 0) {
      return responseJSON({ success: true, message: "No users or notes to sync", filesCount: 0 });
    }

    // 1. Get or create the master Google Drive backup folder
    const folderName = "Mindshare User Backups";
    const folders = DriveApp.getFoldersByName(folderName);
    let targetFolder;

    if (folders.hasNext()) {
      targetFolder = folders.next();
    } else {
      targetFolder = DriveApp.createFolder(folderName);
    }

    const results = [];

    // 2. Process each user (creates or updates their dedicated sheet)
    users.forEach(function(user) {
      const username = (user.username || "user").toLowerCase().trim();
      const fileName = "Mindshare_@" + username;

      // Look for existing file in the folder
      const files = targetFolder.getFilesByName(fileName);
      let spreadsheet;
      let isNew = false;

      if (files.hasNext()) {
        const existingFile = files.next();
        spreadsheet = SpreadsheetApp.open(existingFile);
      } else {
        // Create new individual Google Sheet file for this user
        spreadsheet = SpreadsheetApp.create(fileName);
        const driveFile = DriveApp.getFileById(spreadsheet.getId());
        targetFolder.addFile(driveFile);
        // Remove from root drive to keep folder tidy
        DriveApp.getRootFolder().removeFile(driveFile);
        isNew = true;
      }

      const sheet = spreadsheet.getActiveSheet();
      sheet.setName("@" + username + " Thoughts");
      sheet.clear();

      // Header Row
      const headers = [
        "#",
        "Thought ID",
        "Created Date",
        "Last Updated",
        "Thought Content",
        "Tags",
        "Mentions",
        "Attached Media URLs",
        "Author Email"
      ];

      sheet.appendRow(headers);

      // Header Styling (Mindshare Indigo / Blue Header)
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#2563eb");
      headerRange.setFontColor("#ffffff");
      sheet.setFrozenRows(1);

      // Add all user notes
      const notes = user.notes || [];
      notes.forEach(function(note, idx) {
        sheet.appendRow([
          idx + 1,
          note.id || "",
          note.created_at || "",
          note.updated_at || "",
          note.content || "",
          Array.isArray(note.tags) ? note.tags.map(function(t) { return "#" + t; }).join(", ") : (note.tags || ""),
          Array.isArray(note.mentions) ? note.mentions.map(function(m) { return "@" + m; }).join(", ") : (note.mentions || ""),
          Array.isArray(note.media_urls) ? note.media_urls.join("\n") : (note.media_urls || ""),
          user.email || ""
        ]);
      });

      // Auto-size columns for readability
      for (let c = 1; c <= headers.length; c++) {
        sheet.autoResizeColumn(c);
      }

      results.push({
        username: username,
        isNew: isNew,
        fileUrl: spreadsheet.getUrl(),
        notesCount: notes.length
      });
    });

    return responseJSON({
      success: true,
      folderUrl: targetFolder.getUrl(),
      totalUsers: users.length,
      syncedFiles: results,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return responseJSON({ error: err.toString(), success: false });
  }
}

function responseJSON(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
