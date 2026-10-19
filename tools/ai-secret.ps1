param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("protect", "unprotect")]
  [string]$Mode
)

$text = [Console]::In.ReadToEnd().Trim()
if ($Mode -eq "protect") {
  $secure = ConvertTo-SecureString -String $text -AsPlainText -Force
  [Console]::Out.Write((ConvertFrom-SecureString -SecureString $secure))
} else {
  $secure = ConvertTo-SecureString -String $text
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr))
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}
