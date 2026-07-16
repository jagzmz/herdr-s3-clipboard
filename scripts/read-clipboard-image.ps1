param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$image = $null

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $image = [System.Windows.Forms.Clipboard]::GetImage()
  if ($null -eq $image) {
    [Console]::Error.WriteLine("HSC_NO_IMAGE: the clipboard has no image data")
    exit 2
  }

  $image.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  [Console]::Out.WriteLine('{"contentType":"image/png","extension":"png"}')
}
catch {
  [Console]::Error.WriteLine("HSC_CLIPBOARD_ERROR: $($_.Exception.Message)")
  exit 1
}
finally {
  if ($null -ne $image) {
    $image.Dispose()
  }
}
