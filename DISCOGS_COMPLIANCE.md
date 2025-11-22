# Discogs API Compliance

## ✅ SlotSync is Fully Compliant

### Discogs API Terms of Service
Discogs explicitly allows developers to:
- ✅ Search releases
- ✅ Retrieve metadata per release
- ✅ Show cover images
- ✅ Store data needed to support your app
- ✅ Build apps that help people manage their own vinyl collections

### Key Compliance Points

#### ✅ What SlotSync Does (Compliant)
1. **Searches Discogs API** - Only when user scans an album cover
2. **Retrieves metadata** - Artist, title, year, cover image for user's scanned records
3. **Stores in local database** - Only records the user has personally scanned/added
4. **Caches for performance** - Stores user's own collection for fast future lookups
5. **No database duplication** - Never scrapes or downloads Discogs' entire database

#### ❌ What SlotSync Does NOT Do (Compliant)
1. ❌ Does NOT duplicate Discogs database
2. ❌ Does NOT recreate Discogs database
3. ❌ Does NOT redistribute Discogs data
4. ❌ Does NOT bulk download releases
5. ❌ Does NOT share data with other users

### Local Database Purpose

The `identified_records.db` database:
- **Only contains**: Records the user has personally scanned
- **Purpose**: Fast lookup cache for user's own collection
- **Compliance**: This is explicitly allowed by Discogs terms

### API Usage Pattern

```
User Action → API Call → Store User's Record → Done
     ↓            ↓              ↓
  Scan cover  Search Discogs  Cache locally
```

**This is a personal collection management tool, not a database duplication tool.**

---

## 📋 Discogs Developer Terms Compliance

### Allowed Uses ✅
- [x] Search releases via API
- [x] Retrieve metadata for user's records
- [x] Display cover images
- [x] Store data to support app functionality
- [x] Help users manage their own collections

### Prohibited Uses ❌
- [x] NOT duplicating Discogs database
- [x] NOT recreating Discogs database
- [x] NOT redistributing Discogs data
- [x] NOT bulk downloading releases

---

## 🔒 Data Storage

### What We Store
- **User's scanned records only**
- **Metadata from API** (artist, title, year, cover URL)
- **Local cache** for performance

### What We Don't Store
- Entire Discogs database
- Releases user hasn't scanned
- Bulk data downloads
- Shared/public data

---

## ✅ Conclusion

**SlotSync is 100% compliant with Discogs API terms.**

- We use the API as intended (search on-demand)
- We store only user's personal collection
- We don't duplicate or redistribute data
- We're building a personal collection management tool

**Proceed with confidence!** 🎉

