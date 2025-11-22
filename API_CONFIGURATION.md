# API Configuration Guide

This guide explains how to configure the SlotSync app to connect to your backend API for record identification.

## Quick Setup

### Option 1: Environment Variable (Recommended)

Create a `.env` file in the project root:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

Then restart your Expo development server.

### Option 2: app.json Configuration

Add to your `app.json`:

```json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "http://localhost:3000"
    }
  }
}
```

## Local Development URLs

### iOS Simulator
```
http://localhost:3000
```

### Android Emulator
```
http://10.0.2.2:3000
```

### Physical Device
```
http://YOUR_COMPUTER_IP:3000
```

To find your computer's IP:
- **macOS/Linux**: Run `ifconfig` or `ip addr`
- **Windows**: Run `ipconfig`

## Testing the Connection

1. Start the example backend server (see `backend-example/README.md`)
2. Update your API URL in the app
3. Try scanning an album cover
4. Check the console logs for connection status

## Production Setup

For production, use your deployed API:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

Make sure your API:
- Uses HTTPS
- Has proper CORS configuration
- Implements rate limiting
- Has authentication if needed

## Troubleshooting

### "Network request failed"
- Check that the backend server is running
- Verify the API URL is correct
- For physical devices, ensure phone and computer are on the same network
- Check firewall settings

### "Request timed out"
- Increase timeout in `src/config/api.ts` (default: 30 seconds)
- Check network connection
- Verify API server is responding

### "API returned error"
- Check backend server logs
- Verify API endpoint format matches expected structure
- See `BACKEND_API.md` for API specification

## Next Steps

1. Set up your backend API (see `BACKEND_API.md`)
2. Configure the API URL using one of the methods above
3. Test the identification flow
4. Deploy to production when ready

