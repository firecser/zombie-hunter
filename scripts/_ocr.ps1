$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]

$path = "C:\Users\guoxiaoyu\Documents\微信小游戏提审\向僵尸开炮技能\温压弹.jpg"
$file = [Windows.Storage.StorageFile]::GetFileFromPathAsync($path).GetAwaiter().GetResult()
$stream = $file.OpenReadAsync().GetAwaiter().GetResult()
$bmp = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream).GetAwaiter().GetResult()
$swbmp = $bmp.GetSoftwareBitmapAsync().GetAwaiter().GetResult()
$w = [double]$swbmp.PixelWidth
$h = [double]$swbmp.PixelHeight
Write-Output "SIZE $w $h"
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { Write-Output "NO_ENGINE_(need_zh_language_pack)"; exit }
$chunk = 1000
$overlap = 150
$y = 0
$i = 0
while ($y -lt $h) {
    $hTake = [Math]::Min($chunk, $h - $y)
    $rect = [Windows.Foundation.Rect]::new(0.0, [double]$y, $w, [double]$hTake)
    $crop = $swbmp.Crop($rect)
    $res = $engine.RecognizeAsync($crop).GetAwaiter().GetResult()
    Write-Output "=== CHUNK $i (y=$y h=$hTake) ==="
    Write-Output $res.Text
    $i++
    if (($y + $hTake) -ge $h) { break }
    $y = $y + $chunk - $overlap
}
