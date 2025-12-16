<?php
// TV Stream Root Router
// Directs requests to appropriate files

// Get request path
$request_uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$request_uri = str_replace('/index.php', '', $request_uri);

// Get the script directory
$base_path = dirname(__FILE__);

// Normalize path
$path = trim($request_uri, '/');

// Remove query strings
$path = explode('?', $path)[0];

// Handle static files (images, CSS, JS, fonts)
$static_extensions = array('css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'json', 'webp');
if ($path && file_exists($base_path . '/' . $path)) {
    $file_path = $base_path . '/' . $path;
    
    // Get file extension
    $ext = strtolower(pathinfo($file_path, PATHINFO_EXTENSION));
    
    if (in_array($ext, $static_extensions) || is_dir($file_path)) {
        // Serve static files with correct MIME types
        $mime_types = array(
            'html' => 'text/html',
            'json' => 'application/json',
            'css' => 'text/css',
            'js' => 'application/javascript',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'svg' => 'image/svg+xml',
            'ico' => 'image/x-icon',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'ttf' => 'font/ttf',
            'webp' => 'image/webp'
        );
        
        if (isset($mime_types[$ext])) {
            header('Content-Type: ' . $mime_types[$ext]);
        }
        
        if (is_file($file_path)) {
            readfile($file_path);
        } else {
            // Directory - list or serve index
            if (file_exists($file_path . '/index.html')) {
                header('Content-Type: text/html');
                readfile($file_path . '/index.html');
            } elseif (file_exists($file_path . '/index.php')) {
                include $file_path . '/index.php';
            }
        }
        exit;
    }
}

// Boost TZ removed from routing

// Handle admin requests
if ($path === 'admin' || $path === 'admin.html' || $path === 'admin/') {
    if (file_exists($base_path . '/admin.html')) {
        header('Content-Type: text/html');
        readfile($base_path . '/admin.html');
        exit;
    }
}

// Handle root/index requests
if (!$path || $path === '/' || $path === 'index.html' || $path === 'index.php') {
    header('Content-Type: text/html');
    readfile($base_path . '/TV-Stream-PRO.html');
    exit;
}

// Handle football-ai
if ($path === 'football-ai' || $path === 'football-ai.html') {
    header('Content-Type: text/html');
    readfile($base_path . '/football-ai.html');
    exit;
}

// Default: Try as PHP file
if (file_exists($base_path . '/' . $path . '.php')) {
    include $base_path . '/' . $path . '.php';
    exit;
}

// Default: Try as HTML file
if (file_exists($base_path . '/' . $path . '.html')) {
    header('Content-Type: text/html');
    readfile($base_path . '/' . $path . '.html');
    exit;
}

// Fallback: Serve main TV Stream page
header('Content-Type: text/html');
readfile($base_path . '/TV-Stream-PRO.html');

