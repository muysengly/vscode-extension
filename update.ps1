# auto commit and push
$msg = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

git add .
git commit -m "$msg"
git push
