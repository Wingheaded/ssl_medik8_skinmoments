# Deployment Guide: C-Panel (Private Server)

This guide explains how to host the **Frontend** (HTML, CSS, JS) of the Medik8 Skin Moments application on your own C-Panel server, while keeping the **Backend** (Database & Auth) securely on Firebase.

## Prerequisites
- Access to your C-Panel File Manager or FTP.
- A domain or subdomain (e.g., `agenda.suafarmacia.pt`).
- **SSL Certificate (HTTPS)** installed on your domain (Required for PWA and Security).

## Step 1: Prepare the Files
Since this is a modern "Vanilla JS" application, there is no complex build process. You just need to package the files.

1.  **Create a Folder** on your computer named `deploy`.
2.  **Copy** the following files/folders into it:
    - `index.html`
    - `admin.html`
    - `favicon.ico` (and `assets/` folder)
    - `css/` or `*.css` files (`styles.css`, `date-styles.css`, `print.css`, `admin-styles.css` etc.)
    - `js/` or `*.js` files (`app.js`, `auth.js`, `firebase-config.js`, `admin.js`, `scheduler.js` etc.)
    - `pwa/` folder (for the mobile app capability)
    - `strings.pt.json` and `strings.en.json` (Languages)

> [!WARNING]
> **Do NOT upload**: `.git`, `firestore.rules`, `firebase.json`, `secure-pins.js` (you can keep it for backup, but it's not needed for the live app), or any `.md` documentation files.

## Step 2: Upload to C-Panel
1.  **Log in** to C-Panel.
2.  Open **File Manager**.
3.  Navigate to `public_html` (or create a subdomain folder like `public_html/agenda`).
4.  **Upload** all the files from your `deploy` folder.
5.  If you uploaded a `.zip`, **Extract** it there.

## Step 3: Configure Firebase Security (CRITICAL)
For the login to work on your domain, you must tell Firebase to trust your server.

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project.
3.  Navigate to **Authentication** > **Settings**.
4.  Click **Authorized Domains**.
5.  Click **Add Domain**.
6.  Enter your C-Panel domain (e.g., `agenda.suafarmacia.pt`).
7.  Click **Add**.

## Step 4: Verify
1.  Open your website link (e.g., `https://agenda.suafarmacia.pt`).
2.  **Test Login**: Authenticate as a pharmacy.
    - If you get an error like *auth/unauthorized-domain*, wait 5 minutes and check Step 3.

## Step 5: Database Rules (Done)
You have already deployed the strict security rules to Google's cloud. No action is required here. Your specific C-Panel server does not store the data; it just displays the interface. The data still lives securely in Cloud Firestore.
