import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import React, { useState, useEffect, useRef } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { ngrok } from './apiConfig';

export default function LoginScreen({ onLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const navigation = useNavigation();
  const didAutoLoginRef = useRef(false); // run auto-login once

  // -- helpers ---------------------------------------------------------------

  const saveUserSession = async ({ userID, token, name, email }) => {
    try {
      await AsyncStorage.multiSet([
        [`token_${userID}`, token],
        ['lastLoggedInUserID', String(userID)],
        [`user_${userID}`, JSON.stringify({ userID, name, email })],
      ]);
      console.log(`Saved session for user ${userID}`);
    } catch (err) {
      console.error('Error saving session:', err);
    }
  };

  const loadLastSession = async () => {
    const lastUserID = await AsyncStorage.getItem('lastLoggedInUserID');
    if (!lastUserID) return null;

    const [[, token], [, userJson]] = await AsyncStorage.multiGet([
      `token_${lastUserID}`,
      `user_${lastUserID}`,
    ]);

    const user =
      userJson ? JSON.parse(userJson) : { userID: Number(lastUserID), name: '', email: '' };

    return token ? { userID: Number(lastUserID), token, user } : null;
  };

  const clearLastSession = async (userID) => {
    try {
      if (userID) await AsyncStorage.removeItem(`token_${userID}`);
      await AsyncStorage.removeItem('lastLoggedInUserID');
    } catch (e) {
      // ignore
    }
  };

  // -- auto-login on mount ---------------------------------------------------

  useEffect(() => {
    if (didAutoLoginRef.current) return;
    didAutoLoginRef.current = true;

    (async () => {
      try {
        console.log('LoginScreen: Attempting auto-login…');
        const last = await loadLastSession();
        if (!last) {
          console.log('LoginScreen: No previous session found.');
          return;
        }

        // verify boolean
        const verify = await axios.post(`${ngrok}/verify-token`, { token: last.token });
        if (verify?.data?.valid === true) {
          console.log('LoginScreen: Token valid. Auto-logging in.');
          onLogin(last.token, last.user); // use cached profile
          navigation.reset({ index: 0, routes: [{ name: 'MainPage' }] });
        } else {
          console.log('LoginScreen: Token invalid/expired.');
          await clearLastSession(last.userID);
        }
      } catch (err) {
        console.error('LoginScreen: Auto-login error:', err?.response?.data || err.message);
        // do not hard-reset; leave user on Login
      }
    })();
  }, [onLogin, navigation]);

  // -- register/login handlers ----------------------------------------------

  const handleRegister = async () => {
    try {
      const res = await axios.post(`${ngrok}/register`, { name, email });
      const { token, userID, name: registeredName, email: userEmail } = res.data;

      await saveUserSession({ userID, token, name: registeredName, email: userEmail });
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
      const res = await axios.post(`${ngrok}/login`, { name, email });
      const { token, userID, name: registeredName, email: userEmail } = res.data;

      await saveUserSession({ userID, token, name: registeredName, email: userEmail });
      onLogin(token, { userID, name: registeredName, email: userEmail });
      navigation.reset({ index: 0, routes: [{ name: 'MainPage' }] });
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      Alert.alert('Login failed', error.response?.data?.error || 'Something went wrong.');
    }
  };

  // -- ui --------------------------------------------------------------------

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
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: '#fff' },
  title: { fontSize: 28, marginBottom: 20, textAlign: 'center', fontWeight: 'bold' },
  input: { height: 45, borderColor: '#666', borderWidth: 1, marginBottom: 15, borderRadius: 8, paddingHorizontal: 10 },
});
