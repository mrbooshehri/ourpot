import 'package:flutter/material.dart';
void main() => runApp(const OurpotApp());
class OurpotApp extends StatelessWidget { const OurpotApp({super.key}); @override Widget build(BuildContext context) => MaterialApp(title: 'Ourpot', theme: ThemeData(colorSchemeSeed: const Color(0xff1d5b4a), useMaterial3: true), home: const Scaffold(body: Center(child: Text('Sign in to Ourpot')))); }
