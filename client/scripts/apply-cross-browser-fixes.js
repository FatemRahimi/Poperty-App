#!/usr/bin/env node

/**
 * Utility script to apply cross-browser fixes to React components
 * Run with: node client/scripts/apply-cross-browser-fixes.js
 */

const fs = require('fs');
const path = require('path');

// Files that need cross-browser reset import
const componentsToUpdate = [
  'client/src/pages/AddList.js',
  'client/src/pages/AddLeaseNext.js', 
  'client/src/pages/AddListNext.js',
  'client/src/pages/Signup.js',
  'client/src/pages/Login.js',
  'client/src/pages/SellerForm.js',
  'client/src/pages/UserDashboard.js',
  'client/src/pages/AdminDashboard.js'
];

// CSS classes to replace for consistency
const classReplacements = {
  'form-control': 'form-input-base focus-ring',
  'btn btn-primary': 'button-base btn-primary',
  'btn btn-secondary': 'button-base btn-secondary'
};

function addCrossBrowserImport(filePath) {
  const fullPath = path.resolve(filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Check if import already exists
  if (content.includes('CrossBrowserReset.css')) {
    console.log(`✅ ${filePath} already has cross-browser import`);
    return;
  }

  // Find the last import statement
  const importRegex = /import.*?;/g;
  const imports = content.match(importRegex);
  
  if (imports && imports.length > 0) {
    const lastImport = imports[imports.length - 1];
    const crossBrowserImport = `import "../styles/CrossBrowserReset.css"; // Cross-browser consistency`;
    
    // Insert after the last import
    content = content.replace(lastImport, `${lastImport}\n${crossBrowserImport}`);
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Added cross-browser import to ${filePath}`);
  } else {
    console.log(`⚠️  No import statements found in ${filePath}`);
  }
}

function updateClassNames(filePath) {
  const fullPath = path.resolve(filePath);
  
  if (!fs.existsSync(fullPath)) {
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let updated = false;

  Object.entries(classReplacements).forEach(([oldClass, newClass]) => {
    // Escape special regex characters
    const escapedOldClass = oldClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`className="([^"]*\\s)?${escapedOldClass}(\\s[^"]*)?"`,'g');
    
    const newContent = content.replace(regex, (match, prefix = '', suffix = '') => {
      updated = true;
      const cleanPrefix = prefix ? prefix.trim() + ' ' : '';
      const cleanSuffix = suffix ? ' ' + suffix.trim() : '';
      return `className="${cleanPrefix}${newClass}${cleanSuffix}"`.replace(/\s+/g, ' ').replace(/"\s+/, '"').replace(/\s+"/, '"');
    });
    content = newContent;
  });

  if (updated) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Updated class names in ${filePath}`);
  }
}

function createChecklist() {
  const checklistContent = `# Cross-Browser Implementation Checklist

## Files Updated with Cross-Browser Reset

${componentsToUpdate.map(file => `- [ ] ${file}`).join('\n')}

## Manual Testing Required

### Desktop Browsers
- [ ] Chrome (latest)
- [ ] Firefox (latest) 
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile Browsers  
- [ ] Safari iOS (iPhone)
- [ ] Safari iOS (iPad)
- [ ] Chrome Android
- [ ] Samsung Internet

## Test Scenarios

### Form Interactions
- [ ] Text input focus/blur
- [ ] Number input behavior
- [ ] Select dropdown appearance
- [ ] Button hover/active states
- [ ] Checkbox/radio button styling
- [ ] Form validation messages

### Layout Consistency
- [ ] Grid layouts render identically
- [ ] Responsive breakpoints work
- [ ] Font rendering is consistent
- [ ] Colors match across browsers

### Performance
- [ ] Page load times similar
- [ ] Smooth animations/transitions
- [ ] No browser-specific lag

## Issues Found

Document any browser-specific issues here:

### Safari Issues
- [ ] Issue: ________________
  - Solution: ________________

### Firefox Issues  
- [ ] Issue: ________________
  - Solution: ________________

### Chrome Issues
- [ ] Issue: ________________
  - Solution: ________________

### Mobile Issues
- [ ] Issue: ________________
  - Solution: ________________

## Completion

- [ ] All components updated
- [ ] All browsers tested
- [ ] All issues documented
- [ ] Performance verified
- [ ] Team review completed

---
Generated: ${new Date().toISOString()}
`;

  fs.writeFileSync('CROSS_BROWSER_CHECKLIST.md', checklistContent);
  console.log('✅ Created implementation checklist');
}

function main() {
  console.log('🚀 Applying Cross-Browser Fixes...\n');

  // Add imports to components
  console.log('📦 Adding cross-browser imports...');
  componentsToUpdate.forEach(addCrossBrowserImport);

  console.log('\n🎨 Updating class names for consistency...');
  componentsToUpdate.forEach(updateClassNames);

  console.log('\n📋 Creating implementation checklist...');
  createChecklist();

  console.log('\n✨ Cross-browser fixes applied successfully!');
  console.log('\n📋 Next steps:');
  console.log('1. Review the CROSS_BROWSER_CHECKLIST.md file');
  console.log('2. Test your application in different browsers');
  console.log('3. Update any remaining hardcoded styles');
  console.log('4. Follow the CROSS_BROWSER_GUIDE.md for best practices');
}

if (require.main === module) {
  main();
}

module.exports = {
  addCrossBrowserImport,
  updateClassNames,
  createChecklist
}; 