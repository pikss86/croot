## Croot - CRUD HTTP server and tooling.  

### Operations and HTTP methods
```
Create (POST)   > croot create path [value]  
Read   (GET)    > croot [read] path  
Update (PUT)    > croot [update] path value  
Delete (DELETE) > croot delete path  
  

croot /  
список файлов в корне  
  
croot /index.html  
содержимое файла  
  
croot /subdir  
список файлов в папке subdir  

croot create /emptyfile  
создаст пустой файл emptyfile если он не создан, если создан ничего не произойдет  
  
croot create /subdir/  
создаст пустую папку subdir  
  
croot create /subdir  
если папка существует то внутри создастся папка 0  
  
croot create /subdir  
если папка существует и внутри существует папка 0 то внутри создастся папка 1  
  
croot create /subdir/1 "Какая-то строка текста"  
в папке 1 создаст файл 0 и запишет туда строку  

croot create /subdir "Какая-то строка текста"  
в папке subdir создаст файл 2 и запишет туда содержимое строки  
  
croot /subdir/2  
выведет содержимое файла  

croot create /subdir/3.json  
создаст пустой файл  
  
croot create /subdir/3.json  
внутри файла 3.json создастся массив и в него заполнится элемент 0 значением null  
  
croot create /subdir/3.json/0  
в элемент 0 присвоится массив и он заполнится элементом 0 со значением null  
  
croot create /subdir/3.json/0/0/mykey  
создастся объект и в нем поле mykey со значением null
  
```