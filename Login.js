import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { ngrok } from './apiConfig'; // Ensure this path is correct

export default function LoginScreen({ onLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigation = useNavigation();

  const handleRegister = async () => {
    try {
      
      //const response = await axios.post(`http://192.168.50.241:3000/register`, {
      const response = await axios.post(`${ngrok}/register`, {
        name,
        email,
        password,
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
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
      />
      <Button title="Register" onPress={handleRegister} />
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