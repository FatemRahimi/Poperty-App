# Push Project to GitHub

## Steps to Push (After Installing Git)

### 1. Initialize Git Repository (if not already done)
```bash
git init
```

### 2. Add the GitHub remote
```bash
git remote add origin https://github.com/FatemRahimi/Poperty-App.git
```

### 3. Add all files to staging
```bash
git add .
```

### 4. Commit your changes
```bash
git commit -m "Complete property management system with advisor profiles and expert photos"
```

### 5. Set the default branch to temp-branch (to match your GitHub repo)
```bash
git branch -M temp-branch
```

### 6. Push to GitHub
```bash
git push -u origin temp-branch
```

---

## If You Get Authentication Error

When pushing, GitHub will ask for authentication. Use one of these methods:

### Option A: Personal Access Token (Recommended)
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Give it a name: "Property App"
4. Select scopes: `repo` (full control)
5. Click "Generate token"
6. Copy the token (you won't see it again!)
7. When Git asks for password, paste the token instead

### Option B: GitHub Desktop
- Use GitHub Desktop (easier, no command line needed)
- Download: https://desktop.github.com/

---

## Quick Command Reference

### Check Git status
```bash
git status
```

### View commit history
```bash
git log --oneline
```

### Check remote repository
```bash
git remote -v
```

### Pull latest changes from GitHub
```bash
git pull origin temp-branch
```

### Push changes to GitHub
```bash
git push origin temp-branch
```

---

## Important Files to Review Before Push

The following files contain the latest updates:
- ✅ `client/src/pages/AdvisorProfile.js` - Expert photo upload fix
- ✅ `client/src/pages/UserDashboard.js` - Advisor profile requirement
- ✅ `client/src/components/PropertyAdvisorCard.jsx` - Conditional display
- ✅ `client/src/App.js` - Protected routes
- ✅ `server/routes/userRoutes.js` - Expert photo upload handling
- ✅ `server/controllers/userController.js` - Expert photo processing
- ✅ `EXPERT_PHOTOS_FIX.md` - Documentation of expert photos fix

---

**Date:** December 19, 2025
**Repository:** https://github.com/FatemRahimi/Poperty-App.git
**Branch:** temp-branch

