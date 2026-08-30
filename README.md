# Meoww 🎵

A real-time collaborative music streaming app. Create a room, share the 6-letter code with friends, and listen to the same tracks in perfect sync. No accounts, no ads, no data stored.

![Meoww](public/logo.gif)

## ✨ Features

- 🎵 **Real-time sync** — host and listeners stay aligned to within 0.3s via Firebase Realtime Database
- 📋 **Shared queue** — anyone in the room can add songs and reorder the playlist (host controls active playback)
- 🎬 **YouTube-to-MP3** — paste any YouTube link and convert it to a streamable MP3 (via free public API)
- 📁 **Local file upload** — drag-drop or pick an MP3 from your device (uses object URLs, no server)
- 🔗 **Direct URL** — add any publicly hosted MP3 by URL
- 🎲 **Shuffle, mute, seek, next/prev** — full transport controls
- 👥 **Live presence** — see who's connected; auto-end session when host disconnects
- 🌓 **Monochrome design** — clean, fast, no clutter

## 🛠 Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS** + **shadcn/ui** components
- **Firebase Realtime Database** (for room sync and presence)
- **@hello-pangea/dnd** (drag-and-drop playlist reorder)
- **lucide-react** (icons)
- **cobalt.tools** (free YouTube-to-MP3 conversion)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm

### Install

```bash
npm install
```

### Run dev server

```bash
npm run dev
```

The app will be available at `http://localhost:8080`.

### Build for production

```bash
npm run build
```

Outputs static files to `dist/`.

## 🔥 Firebase Setup (optional)

The app ships with a default Firebase config that works out of the box for small/medium rooms. For production use, replace the config in `src/lib/firebase.ts` with your own Firebase project:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Realtime Database**
4. Copy your config and paste it into `src/lib/firebase.ts`
5. Set database rules to allow read/write (or add auth later):

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

## 🌐 Deploy

The built app is a static site. Deploy anywhere:

- **Vercel**: `vercel --prod`
- **Netlify**: drag-drop the `dist/` folder
- **GitHub Pages**: push `dist/` to a `gh-pages` branch
- **Cloudflare Pages**: connect repo, build command `npm run build`, output `dist/`

The included `vercel.json` has the rewrite rule for SPA routing.

## 📁 Project Structure

```
src/
├── components/        # UI components (RoomDrawer, etc.)
├── hooks/             # Custom hooks (useFirebaseSync, use-toast)
├── lib/               # Utilities (firebase, nameFormat, youtubeToMp3, etc.)
├── pages/             # Route pages (Index, Room, CreateRoom, JoinRoom, NotFound)
├── types/             # TypeScript interfaces
├── utils/             # Toast helpers
├── App.tsx            # Router setup
└── main.tsx           # Entry point
```

## 🤝 How It Works

1. **Host** clicks "Create Room", enters a nickname → gets a 6-letter room code
2. **Listeners** click "Join Room", enter nickname + code → join the room
3. Host plays tracks; playback state (current track, position, play/pause, queue) syncs to listeners every 500ms via Firebase
4. Listeners correct their playback position if they drift more than 0.3s
5. When host disconnects, the room auto-ends for everyone

## 📝 License

MIT