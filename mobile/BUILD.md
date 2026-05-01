# ThronomedICE Mobile App — Build Guide

## Prerequisites

```bash
npm install -g @expo/eas-cli
eas login          # create a free account at expo.dev
```

## First-time setup

### 1. Firebase files (required for push notifications)

Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com):

- Add an **iOS app** with bundle ID `io.thronos.medice` → download `GoogleService-Info.plist` → place in `mobile/`
- Add an **Android app** with package `io.thronos.medice` → download `google-services.json` → place in `mobile/`

### 2. Link your EAS project

```bash
cd mobile
eas init          # creates the project on expo.dev, fills projectId in app.json
```

### 3. Generate native folders

```bash
npm install
npx expo prebuild --clean   # generates android/ and ios/ from app.json config
```

This auto-applies:
- BLE permissions + background mode (iOS)
- BLUETOOTH_SCAN / BLUETOOTH_CONNECT (Android 12+)
- Firebase GoogleServices files

---

## Build commands

| Target | Command |
|---|---|
| iOS simulator (dev) | `npm run build:dev` |
| Internal TestFlight / APK | `npm run build:preview` |
| App Store / Play Store | `npm run build:ios` / `npm run build:android` |

Builds run on Expo’s cloud — no Xcode/Android Studio required on your machine.

## Submit to stores

```bash
npm run submit:ios       # uploads to TestFlight / App Store
npm run submit:android   # uploads to Google Play internal track
```

For iOS submission, fill in `eas.json`:
- `appleId` — your Apple ID email
- `ascAppId` — App Store Connect app ID (from appstoreconnect.apple.com)
- `appleTeamId` — your Apple Developer team ID

---

## Local development (without a build)

```bash
npm run prebuild    # only needed once, or after native dependency changes
npm run ios        # opens in Xcode simulator
npm run android    # opens in Android emulator
```

## Environment variables

Set via EAS secrets (never commit credentials):

```bash
eas secret:create --scope project --name FCM_SERVER_KEY --value "your-key"
```

The Railway API URL is set at runtime in the app’s Settings screen.
