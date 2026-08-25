# បង្កើតកញ្ចប់ VSIX ពី extension (Build the VSIX package)
npm install

# បង្កើតកញ្ចប់ VSIX ពី extension (Build the VSIX package)
npm run package

# ដំឡើង extension ទៅក្នុង VS Code (Install the extension into VS Code)
code --install-extension vscode-extension-0.0.1.vsix --force

# auto commit and push changes to git
git add .
git commit -m "update"
git push