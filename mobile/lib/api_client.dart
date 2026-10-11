import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiException implements Exception { ApiException(this.statusCode, this.message); final int statusCode; final String message; @override String toString() => 'ApiException($statusCode): $message'; }
class ApiClient {
  ApiClient(this.baseUri, {http.Client? client}) : _client = client ?? http.Client();
  final Uri baseUri; final http.Client _client; String? _cookie;
  Future<Map<String, dynamic>> request(String path, {String method = 'GET', Map<String, dynamic>? body}) async {
    final headers = <String, String>{'accept': 'application/json'}; if (_cookie != null) headers['cookie'] = _cookie!; if (body != null) headers['content-type'] = 'application/json';
    final request = http.Request(method, baseUri.resolve(path))..headers.addAll(headers); if (body != null) request.body = jsonEncode(body);
    final response = await _client.send(request); final setCookie = response.headers['set-cookie']; if (setCookie != null) _cookie = setCookie.split(';').first;
    final decoded = jsonDecode(await response.stream.bytesToString()); if (response.statusCode < 200 || response.statusCode >= 300) throw ApiException(response.statusCode, decoded is Map ? '${decoded['error'] ?? 'Request failed'}' : 'Request failed'); return Map<String, dynamic>.from(decoded as Map);
  }
}
