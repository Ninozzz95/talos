param(
  [Parameter(Mandatory=$true)][ValidateSet('add','remove')][string]$Action,
  [Parameter(Mandatory=$true)][string]$Entry
)
$ErrorActionPreference = 'Stop'
$comparison = [System.StringComparer]::OrdinalIgnoreCase
function Normalize-PathEntry([string]$Value) {
  if ($null -eq $Value) { return '' }
  return $Value.Trim().TrimEnd('\\')
}
$current = [Environment]::GetEnvironmentVariable('Path','User')
if ($null -eq $current) { $current = '' }
$parts = @()
if (-not [string]::IsNullOrWhiteSpace($current)) {
  $parts = @($current.Split(';') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}
$needle = Normalize-PathEntry $Entry
$matched = $false
foreach ($part in $parts) {
  if ($comparison.Equals((Normalize-PathEntry $part), $needle)) { $matched = $true; break }
}
if ($Action -eq 'add') {
  if (-not $matched) { $parts += $Entry }
} else {
  $parts = @($parts | Where-Object { -not $comparison.Equals((Normalize-PathEntry $_), $needle) })
}
$newValue = ($parts -join ';')
if ($newValue -ne $current) {
  [Environment]::SetEnvironmentVariable('Path',$newValue,'User')
}
