import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { ngrok } from './apiConfig';

export default function LoginScreen({ onLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigation = useNavigation();

  const handleRegister = async () => {
    console.log (ngrok);
    try {
      
      //const response = await axios.post(`http://192.168.50.241:3000/register`, {
      const response = await axios.post(`${ngrok}/register`, {
        name,
        email,
       // password,
      });
      console.log('Registration response:', response.data);
      const { token, userID, name: registeredName, email: userEmail } = response.data;
      console.log('Register response:', { userID, name: registeredName, email: userEmail, token });
     try 
     {
      await AsyncStorage.setItem('remember_token', token);
      onLogin(token, { userID, name: registeredName, email: userEmail });
      console.log('Token saved to AsyncStorage:', token);
     } catch (error) {
      console.error('Error saving token to AsyncStorage:', error);
     }

      navigation.reset({
        index: 0,
        routes: [{ name: 'MainPage' }],
      });
    } catch (error) {
      console.error('Registration error2:', error.response?.data || error.message);
      Alert.alert('Registration failed', error.response?.data?.error || 'Something went wrong.');
    }
  };

const handleLogin = async () => {
  console.log('handleLogin: Starting login process');
  try {
    // Check for existing token
    console.log('handleLogin: Checking for stored token in AsyncStorage');
    const storedToken = await AsyncStorage.getItem('remember_token');
    console.log('handleLogin: Stored token:', storedToken);

    if (storedToken) {
      console.log('handleLogin: Found stored token, attempting to verify');
      try {
        const verifyResponse = await axios.post(`${ngrok}/verify-token`, { token: storedToken });
        console.log('handleLogin: Token verification response:', verifyResponse.data);
        const { userID, name: registeredName, email: userEmail } = verifyResponse.data;
        console.log('handleLogin: Token verified successfully:', { userID, name: registeredName, email: userEmail });

        // Token is valid, proceed to MainPage
        onLogin(storedToken, { userID, name: registeredName, email: userEmail });
        console.log('handleLogin: Calling onLogin with token and user data');
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainPage' }],
        });
        console.log('handleLogin: Navigated to MainPage');
        return;
      } catch (verifyError) {
        console.error('handleLogin: Token verification failed:', verifyError.response?.data || verifyError.message);
        console.log('handleLogin: Proceeding to login due to invalid/expired token');
      }
    } else {
      console.log('handleLogin: No stored token found');
    }

    // No valid token, proceed with login
    console.log('handleLogin: Validating input fields');
    if (!name || !email) {
      console.log('handleLogin: Missing name or email');
      Alert.alert('Error', 'Please enter both name and email.');
      return;
    }
    console.log('handleLogin: Input validated, sending login request:', { name, email });

    const response = await axios.post(`${ngrok}/login`, { name, email });
    console.log('handleLogin: Login response:', response.data);
    const { token, userID, name: registeredName, email: userEmail } = response.data;
    console.log('handleLogin: Parsed login response:', { token, userID, name: registeredName, email: userEmail });

    // Save token and user data
    try {
      console.log('handleLogin: Saving token to AsyncStorage');
      await AsyncStorage.setItem('remember_token', token);
      console.log('handleLogin: Token saved successfully:', token);
      onLogin(token, { userID, name: registeredName, email: userEmail });
      console.log('handleLogin: Called onLogin with token and user data');
    } catch (storageError) {
      console.error('handleLogin: Error saving token to AsyncStorage:', storageError);
    }

    // Navigate to MainPage
    console.log('handleLogin: Navigating to MainPage');
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainPage' }],
    });
    console.log('handleLogin: Navigation complete');
  } catch (error) {
    console.error('handleLogin: Login error:', error.response?.data || error.message);
    Alert.alert('Login failed', error.response?.data?.error || 'Something went wrong.');
  }
  console.log('handleLogin: Login process ended');
};


  return (
    <View style={styles.container}>
      <Text style={styles.title}>Register</Text>
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
      {/* <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
      /> */}
      <Button title="Register" onPress={handleRegister} />
      <Button title= "Login" onpress = {handleLogin} />
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