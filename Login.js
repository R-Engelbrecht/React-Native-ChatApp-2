import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { ngrok } from './apiConfig';

export default function LoginScreen({ onLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigation = useNavigation();

  // Save user info + token
  const saveUserSession = async (userID, token, name, email) => {
    try {
      await AsyncStorage.setItem("userSession", JSON.stringify({ userID, token, name, email }));
    } catch (err) {
      console.error("Error saving session:", err);
    }
  };

  // Load user session
  const loadUserSession = async () => {
    try {
      const session = await AsyncStorage.getItem("userSession");
      return session ? JSON.parse(session) : null;
    } catch (err) {
      console.error("Error loading session:", err);
      return null;
    }
  };

  // Check session on boot
  useEffect(() => {
    (async () => {
      const session = await loadUserSession();
      if (session?.token) {
        try {
          const verify = await axios.post(`${ngrok}/verify-token`, { token: session.token });
          const { userID, name, email } = verify.data;

          console.log("Auto-login successful:", userID);
          onLogin(session.token, { userID, name, email });

          navigation.reset({ index: 0, routes: [{ name: 'MainPage' }] });
        } catch (err) {
          console.log("Stored token invalid, showing login screen");
          await AsyncStorage.removeItem("userSession");
        }
      }
    })();
  }, []);

  const handleRegister = async () => {
    try {
      const response = await axios.post(`${ngrok}/register`, { name, email });
      const { token, userID, name: registeredName, email: userEmail } = response.data;

      await saveUserSession(userID, token, registeredName, userEmail);
      onLogin(token, { userID, name: registeredName, email: userEmail });

      navigation.reset({ index: 0, routes: [{ name: 'MainPage' }] });
    } catch (error) {
      console.error('Registration error:', error.response?.data || error.message);
      Alert.alert('Registration failed', error.response?.data?.error || 'Something went wrong.');
    }
  };

  const handleLogin = async () => {
    try {
      if (!name || !email) {
        Alert.alert('Error', 'Please enter both name and email.');
        return;
      }

      const response = await axios.post(`${ngrok}/login`, { name, email });
      const { token, userID, name: registeredName, email: userEmail } = response.data;

      await saveUserSession(userID, token, registeredName, userEmail);
      onLogin(token, { userID, name: registeredName, email: userEmail });

      navigation.reset({ index: 0, routes: [{ name: 'MainPage' }] });
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      Alert.alert('Login failed', error.response?.data?.error || 'Something went wrong.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login / Register</Text>

      <TextInput
        placeholder="Name"
        value={name}
        onChangeText={setName}
        style={styles.input}
      />

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Button title="Register" onPress={handleRegister} />
      <View style={{ marginTop: 10 }} />
      <Button title="Login" onPress={handleLogin} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  input: {
    height: 45,
    borderColor: '#666',
    borderWidth: 1,
    marginBottom: 15,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
});
