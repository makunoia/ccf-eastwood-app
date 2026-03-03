Generate a new AUTH_SECRET value for the .env file.

Steps:
1. Run `openssl rand -base64 32` to generate a secure random secret
2. Show the output to the user and instruct them to paste it as the AUTH_SECRET value in .env
3. Do NOT write the secret directly to any file — let the user do it
