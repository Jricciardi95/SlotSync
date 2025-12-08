# Navigation Structure

## Overview

SlotSync uses a **custom navigation system** (`CustomNavigation.tsx`) instead of React Navigation to avoid compatibility issues with React 19.

## Active Files

### Core Navigation
- **`CustomNavigation.tsx`** - Main navigation implementation (ACTIVELY USED)
- **`RootNavigator.tsx`** - Wrapper that exports CustomNavigation
- **`navigationHelpers.ts`** - Shared utilities and helper functions
- **`types.ts`** - TypeScript type definitions for navigation params
- **`hooks.ts`** - Navigation hooks (useNavigation, useRoute)
- **`useFocusEffect.ts`** - Custom focus effect hook

## Unused Files (Legacy React Navigation)

These files are **NOT USED** but kept for reference:
- **`LibraryNavigator.tsx`** - React Navigation stack navigator (unused)
- **`StandsNavigator.tsx`** - React Navigation stack navigator (unused)
- **`ModesNavigator.tsx`** - React Navigation stack navigator (unused)
- **`CustomTabNavigator.tsx`** - Alternative tab navigator (unused)

**Note:** These can be removed in the future if React Navigation is not needed.

## Import Structure

### ✅ Correct Import Pattern

```typescript
// In screens/components
import { useNavigation } from '../navigation/hooks';
import { useFocusEffect } from '../navigation/useFocusEffect';
import type { LibraryStackParamList } from '../navigation/types';
```

### ❌ Avoid

```typescript
// Don't import directly from CustomNavigation in screens
import { useNavigation } from '../navigation/CustomNavigation'; // ❌
```

## Navigation Flow

1. **RootNavigator** → Wraps **CustomNavigation**
2. **CustomNavigation** → Manages tab state and screen stack
3. **Screens** → Use hooks from `hooks.ts` to navigate
4. **navigationHelpers** → Provides shared utilities

## Breaking Circular Dependencies

### Strategy
- **navigationHelpers.ts** - Contains shared logic (no screen imports)
- **types.ts** - Contains only type definitions (no imports)
- **hooks.ts** - Imports from CustomNavigation (screens import hooks, not CustomNavigation)
- **CustomNavigation.tsx** - Imports screens directly (screens don't import back)

### Import Chain
```
Screens → hooks.ts → CustomNavigation.tsx → Screens
         ↓
    types.ts (no cycles)
    navigationHelpers.ts (no cycles)
```

This structure prevents circular dependencies while maintaining clean separation of concerns.

