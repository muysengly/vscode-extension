# បង្កើតកញ្ចប់ VSIX ពី extension (Build the VSIX package)
npm install


# បង្កើតកញ្ចប់ VSIX ពី extension (Build the VSIX package)
npx @vscode/vsce package --allow-missing-repository


# ដំឡើង extension ទៅក្នុង VS Code (Install the extension into VS Code)
code --install-extension extension-0.0.1.vsix --force