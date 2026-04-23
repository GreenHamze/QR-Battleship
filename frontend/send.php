<?php
/**
 * send.php — QR-to-CPEE callback bridge (no curl, uses file_get_contents).
 * When a user scans a QR code, their phone opens this URL.
 * This script PUTs the scanned value back to the CPEE callback URL.
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: text/html; charset=UTF-8');

$info = isset($_GET['info']) ? trim($_GET['info']) : '';
$cb   = isset($_GET['cb'])   ? trim($_GET['cb'])   : '';

if ($info === '' || $cb === '') {
    http_response_code(400);
    echo '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:40px;background:#0a0e17;color:#fc5c65;}</style></head><body><h1>Missing parameters</h1>';
    if ($info === '') echo '<p>info is missing.</p>';
    if ($cb === '')   echo '<p>cb is missing.</p>';
    echo '</body></html>'; exit;
}

if (!preg_match('/^([A-Fa-f][1-6]|start|new|continue)$/', $info)) {
    http_response_code(400);
    echo '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:40px;background:#0a0e17;color:#fc5c65;}</style></head><body><h1>Invalid value</h1><p>' . htmlspecialchars($info) . ' is not valid.</p></body></html>'; exit;
}

$opts = ['http' => ['method' => 'PUT', 'header' => "Content-Type: text/plain\r\nContent-Length: " . strlen($info), 'content' => $info, 'timeout' => 10, 'ignore_errors' => true]];
$context  = stream_context_create($opts);
$response = @file_get_contents($cb, false, $context);
$success = ($response !== false);
$httpCode = 0;
if (isset($http_response_header[0]) && preg_match('/(\d{3})/', $http_response_header[0], $m)) { $httpCode = (int)$m[1]; }
$infoUpper = strtoupper(htmlspecialchars($info));

if ($success && $httpCode >= 200 && $httpCode < 300) {
    echo '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:40px;background:#0a0e17;color:#c8d6e5;}h1{color:#4bcffa;}.coord{font-size:2rem;font-weight:bold;color:#ffd32a;margin:16px 0;}.info{color:#576574;font-size:0.85rem;margin-top:20px;}</style></head><body><h1>Shot fired!</h1><div class="coord">' . $infoUpper . '</div><p>Your shot has been registered.<br>Check the board for results.</p><p class="info">You can close this tab.</p></body></html>';
} else {
    http_response_code(502);
    echo '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:40px;background:#0a0e17;color:#fc5c65;}.detail{color:#576574;font-size:0.78rem;margin-top:16px;}</style></head><body><h1>Callback failed</h1><p>Could not deliver your shot to CPEE.</p><div class="detail">Coordinate: ' . $infoUpper . '<br>HTTP status: ' . $httpCode . '</div></body></html>';
}
?>
