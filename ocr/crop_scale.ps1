param(
  [Parameter(Mandatory=$true)][string]$Image,
  [Parameter(Mandatory=$true)][string]$Out,
  [Parameter(Mandatory=$true)][int]$X,
  [Parameter(Mandatory=$true)][int]$Y,
  [Parameter(Mandatory=$true)][int]$W,
  [Parameter(Mandatory=$true)][int]$H,
  [int]$Scale = 3,
  [int]$BinThreshold = 0
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($Image)
$crop = [System.Drawing.Bitmap]::new($W, $H)
$g = [System.Drawing.Graphics]::FromImage($crop)
$null = $g.DrawImage($src, [System.Drawing.Rectangle]::new(0,0,$W,$H), [System.Drawing.Rectangle]::new($X,$Y,$W,$H), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
if ($BinThreshold -gt 0) {
  $fl = $BinThreshold / 100.0 * 255.0
  $w2 = $crop.Width; $h2 = $crop.Height
  $bmp2 = [System.Drawing.Bitmap]::new($w2, $h2)
  for ($yy = 0; $yy -lt $h2; $yy++) {
    for ($xx = 0; $xx -lt $w2; $xx++) {
      $c = $crop.GetPixel($xx, $yy)
      $lum = 0.299 * $c.R + 0.587 * $c.G + 0.114 * $c.B
      if ($lum -lt $fl) { $bmp2.SetPixel($xx, $yy, [System.Drawing.Color]::FromArgb(255,0,0,0)) }
      else { $bmp2.SetPixel($xx, $yy, [System.Drawing.Color]::FromArgb(255,255,255,255)) }
    }
  }
  $crop.Dispose()
  $crop = $bmp2
}
if ($Scale -gt 1) {
  $nw = $W * $Scale; $nh = $H * $Scale
  $big = [System.Drawing.Bitmap]::new($nw, $nh)
  $g2 = [System.Drawing.Graphics]::FromImage($big)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $null = $g2.DrawImage($crop, 0, 0, $nw, $nh)
  $g2.Dispose()
  $crop.Dispose()
  $crop = $big
}
$crop.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$crop.Dispose(); $src.Dispose()
Write-Host ("CROP_OK " + $X + "," + $Y + " " + $W + "x" + $H + " scale=" + $Scale + " bin=" + $BinThreshold)