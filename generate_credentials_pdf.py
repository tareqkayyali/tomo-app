#!/usr/bin/env python3
"""Generate TOMO_CREDENTIALS_CHECKLIST.pdf — all credentials needed for App Store/Play Store submission."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)

ORANGE = HexColor("#FF6B35")
TEAL = HexColor("#00D9FF")
DARK_BG = HexColor("#1B191E")
GREEN = HexColor("#30D158")
MUTED = HexColor("#6B6B6B")

def build_pdf():
    doc = SimpleDocTemplate(
        "/Users/tareqelkayyali/Desktop/Tomo/tomo-app/TOMO_CREDENTIALS_CHECKLIST.pdf",
        pagesize=A4,
        topMargin=0.7*inch,
        bottomMargin=0.7*inch,
        leftMargin=0.7*inch,
        rightMargin=0.7*inch,
    )

    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle('DocTitle', parent=styles['Title'],
        fontSize=26, textColor=ORANGE, spaceAfter=4, fontName='Helvetica-Bold'))
    styles.add(ParagraphStyle('DocSubtitle', parent=styles['Normal'],
        fontSize=11, textColor=MUTED, spaceAfter=16, fontName='Helvetica-Oblique', alignment=TA_CENTER))
    styles.add(ParagraphStyle('H1', parent=styles['Heading1'],
        fontSize=20, textColor=ORANGE, spaceBefore=20, spaceAfter=8, fontName='Helvetica-Bold'))
    styles.add(ParagraphStyle('H2', parent=styles['Heading2'],
        fontSize=14, textColor=TEAL, spaceBefore=14, spaceAfter=6, fontName='Helvetica-Bold'))
    styles.add(ParagraphStyle('Body', parent=styles['Normal'],
        fontSize=10, leading=14, spaceAfter=6, fontName='Helvetica'))
    styles.add(ParagraphStyle('BulletPt', parent=styles['Normal'],
        fontSize=10, leading=14, spaceAfter=3, leftIndent=18, bulletIndent=6, fontName='Helvetica'))
    styles.add(ParagraphStyle('LinkStyle', parent=styles['Normal'],
        fontSize=10, leading=14, spaceAfter=3, textColor=TEAL, fontName='Helvetica'))
    styles.add(ParagraphStyle('Note', parent=styles['Normal'],
        fontSize=9, leading=12, spaceAfter=6, fontName='Helvetica-Oblique', textColor=MUTED))
    styles.add(ParagraphStyle('CheckItem', parent=styles['Normal'],
        fontSize=10, leading=16, spaceAfter=2, leftIndent=12, fontName='Helvetica'))

    story = []

    def h1(t): story.append(Paragraph(t, styles['H1']))
    def h2(t): story.append(Paragraph(t, styles['H2']))
    def body(t): story.append(Paragraph(t, styles['Body']))
    def bullet(t): story.append(Paragraph(f"\u2022 {t}", styles['BulletPt']))
    def link(label, url): story.append(Paragraph(f'<a href="{url}" color="#00D9FF">{label}</a>  -  <font color="#6B6B6B">{url}</font>', styles['Body']))
    def note(t): story.append(Paragraph(t, styles['Note']))
    def check(t): story.append(Paragraph(f"\u2610  {t}", styles['CheckItem']))
    def spacer(h=8): story.append(Spacer(1, h))
    def hr(): story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#2E2B31"))); spacer()

    def cred_table(rows):
        data = [["Credential", "Value / Location", "Store As"]] + rows
        t = Table(data, colWidths=[1.8*inch, 2.8*inch, 1.6*inch], repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), ORANGE),
            ('TEXTCOLOR', (0,0), (-1,0), white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('LEADING', (0,0), (-1,-1), 12),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('GRID', (0,0), (-1,-1), 0.5, HexColor("#DDDDDD")),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [HexColor("#F8F5F0"), white]),
            ('LEFTPADDING', (0,0), (-1,-1), 6),
            ('RIGHTPADDING', (0,0), (-1,-1), 6),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(t)
        spacer(10)

    # ── Title ──
    story.append(Spacer(1, 0.8*inch))
    story.append(Paragraph("TOMO", styles['DocTitle']))
    story.append(Paragraph("App Submission Credentials Checklist", styles['DocSubtitle']))
    spacer(6)
    story.append(HRFlowable(width="100%", thickness=2, color=ORANGE))
    spacer(12)
    body("This document lists every credential, API key, and account needed to submit Tomo to the Apple App Store and Google Play Store. Keep this secure.")
    spacer(4)
    body(f"<b>Expo Account:</b> tomo2026 / tareq.kayyali@gmail.com")
    body(f"<b>EAS Project ID:</b> 7cd0fd4e-b7fa-4bd0-8eb5-b15808e224cc")
    body(f"<b>Bundle ID / Package:</b> com.tomo.app")
    body(f"<b>Project URL:</b> https://expo.dev/accounts/tomo2026/projects/tomo")
    spacer(8)
    body("<b>Date:</b> March 19, 2026")
    story.append(PageBreak())

    # ══════════════════════════════════════════
    # SECTION 1: EXPO / EAS
    # ══════════════════════════════════════════
    h1("1. Expo / EAS")
    body("Expo Application Services handles native builds, OTA updates, and app submission.")

    h2("Account")
    link("Expo Dashboard", "https://expo.dev/accounts/tomo2026/projects/tomo")
    cred_table([
        ["Expo Username", "tomo2026", "Expo account"],
        ["Expo Email", "tareq.kayyali@gmail.com", "Expo account"],
        ["EAS Project ID", "7cd0fd4e-b7fa-4bd0-8eb5-b15808e224cc", "app.json"],
    ])

    h2("Access Token (for CI/CD)")
    link("Create Token", "https://expo.dev/settings/access-tokens")
    bullet("Click <b>Create Token</b> - name it <b>github-actions</b>")
    bullet("Copy the token immediately (shown only once)")
    check("Store as GitHub Secret: <b>EXPO_TOKEN</b>")
    note("This token lets GitHub Actions run EAS builds without interactive login.")
    hr()

    # ══════════════════════════════════════════
    # SECTION 2: VERCEL
    # ══════════════════════════════════════════
    h1("2. Vercel")
    body("Vercel hosts both the web frontend (app.my-tomo.com) and backend API (api.my-tomo.com).")

    h2("Deployment Token (for CI/CD)")
    link("Create Token", "https://vercel.com/account/tokens")
    bullet("Click <b>Create</b> - name it <b>github-actions</b>, scope to <b>tareqkayyalis-projects</b>")
    bullet("Copy the token immediately")
    check("Store as GitHub Secret: <b>VERCEL_TOKEN</b>")

    h2("Project IDs (already configured)")
    cred_table([
        ["Frontend Project ID", "prj_q1uTcXazyBCVTQRkJNQxblofVkNQ", "tomo-web"],
        ["Backend Project ID", "prj_N6gEOSuVnwS5QypgzCH2bSxpI4De", "backend"],
        ["Org ID", "team_O05XelWPyLJ2yHVFmmzjYqjc", "Vercel scope"],
    ])
    hr()

    # ══════════════════════════════════════════
    # SECTION 3: APPLE
    # ══════════════════════════════════════════
    h1("3. Apple (iOS App Store)")
    body("Required for iOS app submission. Needs Apple Developer Program membership ($99/yr).")

    h2("Developer Account")
    link("Apple Developer Portal", "https://developer.apple.com/account")
    link("Enroll in Developer Program", "https://developer.apple.com/programs/enroll/")
    check("Enroll in Apple Developer Program ($99/yr)")
    check("Note your <b>Team ID</b> from Membership page")

    h2("App Store Connect API Key")
    link("App Store Connect - Keys", "https://appstoreconnect.apple.com/access/integrations/api")
    bullet("Click <b>Generate API Key</b>")
    bullet("Name: <b>EAS Submit</b>, Access: <b>App Manager</b>")
    bullet("Download the <b>.p8 file</b> (shown only once)")
    check("Note: <b>Key ID</b> (shown in table)")
    check("Note: <b>Issuer ID</b> (shown at top of page)")
    check("Store .p8 file securely")

    cred_table([
        ["Apple Team ID", "(from Membership page)", "APPLE_TEAM_ID"],
        ["ASC Key ID", "(from API Keys table)", "ASC_KEY_ID"],
        ["ASC Issuer ID", "(from API Keys page header)", "ASC_ISSUER_ID"],
        ["ASC .p8 Key File", "(downloaded file)", "Secure storage"],
        ["Bundle ID", "com.tomo.app", "app.json (done)"],
    ])

    h2("EAS Submit Config")
    body("After collecting credentials, update <b>eas.json</b>:")
    body('<font face="Courier" size="9" color="#00D9FF">"submit": { "production": { "ios": { "appleId": "YOUR_APPLE_ID", "ascAppId": "YOUR_APP_ID", "appleTeamId": "YOUR_TEAM_ID" } } }</font>')
    hr()

    # ══════════════════════════════════════════
    # SECTION 4: GOOGLE
    # ══════════════════════════════════════════
    h1("4. Google (Play Store)")
    body("Required for Android app submission.")

    h2("Play Console Account")
    link("Google Play Console", "https://play.google.com/console")
    check("Create developer account ($25 one-time fee)")
    check("Create app listing for <b>Tomo</b>")

    h2("Service Account (for automated submission)")
    link("Google Cloud Console", "https://console.cloud.google.com/iam-admin/serviceaccounts")
    bullet("In Play Console: Settings > API Access > Link Google Cloud project")
    bullet("Create Service Account with <b>Editor</b> role")
    bullet("Generate JSON key file")
    check("Download <b>service-account.json</b>")
    check("Grant service account access in Play Console > API Access")

    cred_table([
        ["Play Console Account", "(your Google account)", "Play Console login"],
        ["Service Account JSON", "(downloaded key file)", "GOOGLE_SERVICE_ACCOUNT_KEY"],
        ["Package Name", "com.tomo.app", "app.json (done)"],
    ])

    h2("EAS Submit Config")
    body("After collecting credentials, update <b>eas.json</b>:")
    body('<font face="Courier" size="9" color="#00D9FF">"submit": { "production": { "android": { "serviceAccountKeyPath": "./google-service-account.json", "track": "internal" } } }</font>')
    hr()
    story.append(PageBreak())

    # ══════════════════════════════════════════
    # SECTION 5: SENTRY
    # ══════════════════════════════════════════
    h1("5. Sentry (Crash Reporting)")
    body("Monitors crashes and errors in production. Free tier covers 5K events/month.")

    h2("Setup")
    link("Sentry Signup", "https://sentry.io/signup/")
    link("Create React Native Project", "https://sentry.io/organizations/new/")
    bullet("Sign up > Create Organization > New Project > <b>React Native</b>")
    bullet("Note the <b>DSN</b> from project settings (looks like https://xxx@xxx.ingest.sentry.io/xxx)")

    h2("Auth Token (for source maps)")
    link("Sentry Auth Tokens", "https://sentry.io/settings/auth-tokens/")
    bullet("Create token with <b>project:releases</b> and <b>org:read</b> scopes")

    cred_table([
        ["Sentry DSN", "(from project settings)", "EXPO_PUBLIC_SENTRY_DSN"],
        ["Sentry Auth Token", "(from auth tokens page)", "SENTRY_AUTH_TOKEN"],
        ["Sentry Org Slug", "(your org name)", "SENTRY_ORG"],
        ["Sentry Project Slug", "(your project name)", "SENTRY_PROJECT"],
    ])

    check("Add EXPO_PUBLIC_SENTRY_DSN to Vercel env vars (frontend)")
    check("Update app.json Sentry plugin with org + project slugs")
    hr()

    # ══════════════════════════════════════════
    # SECTION 6: SUPABASE
    # ══════════════════════════════════════════
    h1("6. Supabase (Already Configured)")
    body("Database and auth backend. These are already in your Vercel environment variables.")

    link("Supabase Dashboard", "https://supabase.com/dashboard")

    cred_table([
        ["Supabase URL", "https://ydtnhxqwvtnypjisaavm.supabase.co", "SUPABASE_URL"],
        ["Supabase Anon Key", "(in Vercel env vars)", "SUPABASE_ANON_KEY"],
        ["Supabase Service Key", "(in Vercel env vars)", "SUPABASE_SERVICE_ROLE_KEY"],
    ])
    hr()

    # ══════════════════════════════════════════
    # SECTION 7: THIRD PARTY
    # ══════════════════════════════════════════
    h1("7. Third-Party Integrations")

    h2("Anthropic (Claude AI)")
    link("Anthropic Console", "https://console.anthropic.com/settings/keys")
    cred_table([
        ["Anthropic API Key", "(in Vercel env vars)", "ANTHROPIC_API_KEY"],
    ])

    h2("Google OAuth (Sign-In)")
    link("Google Cloud Console", "https://console.cloud.google.com/apis/credentials")
    cred_table([
        ["Google Client ID", "(in Supabase Auth settings)", "Google OAuth"],
        ["Google Client Secret", "(in Supabase Auth settings)", "Google OAuth"],
    ])

    h2("WHOOP")
    link("WHOOP Developer Portal", "https://developer-dashboard.whoop.com/")
    cred_table([
        ["WHOOP Client ID", "(in Vercel env vars)", "WHOOP_CLIENT_ID"],
        ["WHOOP Client Secret", "(in Vercel env vars)", "WHOOP_CLIENT_SECRET"],
    ])

    h2("Firebase (Storage Only)")
    link("Firebase Console", "https://console.firebase.google.com/")
    cred_table([
        ["Firebase Config", "(in mobile/src/services/firebase.ts)", "Env vars recommended"],
    ])
    hr()

    # ══════════════════════════════════════════
    # SECTION 8: GITHUB SECRETS
    # ══════════════════════════════════════════
    h1("8. GitHub Secrets Summary")
    body("Set these in your GitHub repo: Settings > Secrets and variables > Actions")

    link("GitHub Repo Settings", "https://github.com/settings")

    cred_table([
        ["VERCEL_TOKEN", "Vercel deploy token", "Required for CI/CD"],
        ["EXPO_TOKEN", "Expo access token", "Required for EAS builds"],
        ["SENTRY_AUTH_TOKEN", "Sentry auth token", "Required for source maps"],
    ])

    h2("Vercel Environment Variables")
    body("Set these in Vercel project settings for the backend:")

    cred_table([
        ["ANTHROPIC_API_KEY", "Claude AI", "Backend"],
        ["SUPABASE_URL", "Database URL", "Backend"],
        ["SUPABASE_SERVICE_ROLE_KEY", "DB admin key", "Backend"],
        ["WHOOP_CLIENT_ID", "WHOOP OAuth", "Backend"],
        ["WHOOP_CLIENT_SECRET", "WHOOP OAuth", "Backend"],
        ["EXPO_PUBLIC_SENTRY_DSN", "Crash reporting", "Both"],
    ])

    spacer(20)
    hr()
    body("<b>Keep this document secure.</b> Do not commit credentials to source control.")
    body("Last updated: March 19, 2026")

    doc.build(story)
    print("PDF generated: TOMO_CREDENTIALS_CHECKLIST.pdf")

if __name__ == "__main__":
    build_pdf()
