Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage $bmp
$g.CopyFromScreen $b.X, $b.Y, 0, 0, $bmp.Size
$out = Join-Path $PWD 'screenshot-desktop.png'
$bmp.Save $out
$g.Dispose()
$bmp.Dispose()
Write-Output $out
