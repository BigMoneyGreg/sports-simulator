// Common first names and surnames by region, for a nation outside every sport's
// world, which has no list of its own in commonNames.ts.

export interface NamePool {
  first: string[];
  last: string[];
  /** Surnames from nearby countries, drawn now and then. */
  borrowed?: string[];
}

export const pool = (first: string, last: string): NamePool => ({ first: first.split(' '), last: last.split(' ').map((s) => s.replaceAll('_', ' ')) });

export const NAME_POOLS = {
  anglo: pool(
    'Jack Harry Oliver George Charlie Jacob Alfie Thomas James Joshua Daniel Ryan Luke Liam Ethan Mason Tyler Lewis Sam Callum Kieran Josh Ben Nathan',
    'Smith Jones Taylor Brown Wilson Walker Wright Hughes Green Hall Wood Clarke Turner Hill Cooper Ward Morris King Baker Harrison Mitchell Bennett Carter Lloyd Barker Fletcher Webb',
  ),
  scottish: pool(
    'Callum Lewis Ross Fraser Hamish Euan Ruaridh Craig Scott Jamie Calum Finlay Lachlan Kyle Grant Murray Alasdair Gregor',
    'MacDonald Campbell Stewart Robertson Thomson Anderson Scott Murray Reid Ross Paterson Fraser Henderson Kerr Morrison Sinclair Munro Gillespie Cameron Duncan Ritchie',
  ),
  irish: pool(
    'Sean Conor Cian Darragh Oisin Niall Eoin Ciaran Padraig Rory Fionn Declan Aidan Tadhg Colm Shane Ronan Killian',
    'Murphy Kelly Byrne Ryan Walsh Doyle McCarthy Gallagher Doherty Kennedy Lynch Quinn Brennan Nolan Daly Healy Flanagan Moran Sheridan Keane',
  ),
  welsh: pool(
    'Rhys Dafydd Owain Gethin Iwan Aled Huw Gareth Emyr Ioan Tomos Cai Osian Sion Dylan Llyr Geraint',
    'Jones Davies Williams Evans Thomas Roberts Hughes Lewis Morgan Griffiths Owen Price Pritchard Llewellyn Rees Powell Vaughan Parry Bowen Jenkins',
  ),
  spanish: pool(
    'Javier Sergio Alejandro Pablo Daniel Adrian Alvaro Diego Hugo Mario Raul Ivan Rodrigo Marcos Iker Unai Gonzalo Jorge Ruben Victor',
    'Garcia Fernandez Gonzalez Rodriguez Lopez Martinez Sanchez Perez Gomez Martin Jimenez Ruiz Hernandez Diaz Moreno Alonso Navarro Torres Dominguez Vazquez Gil Serrano Molina',
  ),
  latam: pool(
    'Matias Santiago Sebastian Nicolas Joaquin Emiliano Facundo Agustin Thiago Benjamin Franco Bruno Gael Mateo Alexis Kevin Brayan Jhon Andres Cristian',
    'Gonzalez Rodriguez Gomez Fernandez Lopez Diaz Martinez Perez Romero Sosa Alvarez Torres Ruiz Ramirez Flores Acosta Benitez Medina Herrera Castro Rojas Vargas Mendoza Cabrera',
  ),
  brazilian: pool(
    'Gabriel Lucas Matheus Pedro Guilherme Rafael Felipe Vinicius Joao Gustavo Leonardo Caio Arthur Davi Bruno Igor Murilo Danilo Renan',
    'Silva Santos Oliveira Souza Lima Pereira Costa Ferreira Rodrigues Almeida Nascimento Carvalho Araujo Ribeiro Gomes Barbosa Rocha Dias Teixeira Moreira Cardoso Freitas',
  ),
  portuguese: pool(
    'Joao Tiago Diogo Rodrigo Goncalo Rafael Andre Miguel Bruno Pedro Duarte Martim Vasco Hugo Fabio',
    'Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Sousa Goncalves Gomes Lopes Marques Alves Almeida Ribeiro Pinto Carvalho Teixeira Moreira Correia',
  ),
  italian: pool(
    'Lorenzo Alessandro Francesco Matteo Andrea Gabriele Riccardo Tommaso Davide Federico Simone Luca Marco Giacomo Nicolo Pietro Stefano Daniele',
    'Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti Leone Costa Giordano Mancini Rizzo Lombardi Moretti Barbieri Fontana',
  ),
  french: pool(
    'Lucas Hugo Theo Nathan Louis Enzo Mathis Tom Clement Antoine Maxime Baptiste Quentin Romain Valentin Florian Julien Alexis Jules Adrien',
    'Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent Lefebvre Michel Garcia David Bertrand Roux Vincent Fournier Morel Girard Mercier Lambert',
  ),
  german: pool(
    'Lukas Leon Jonas Finn Felix Niklas Maximilian Paul Tim Jan Moritz Julian Tobias Florian Lennart Marvin Philipp Fabian Kevin Dominik',
    'Muller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Koch Richter Klein Wolf Neumann Schwarz Zimmermann Braun Kruger Hartmann Lange Werner Krause',
  ),
  dutch: pool(
    'Daan Sem Lars Bram Thijs Jesse Ruben Stijn Milan Niels Joep Luuk Tim Jasper Sven Wout Koen Jelle',
    'Jansen Visser Smit Bakker Meijer Mulder Bos Vos Peters Hendriks Dekker Brouwer Dijkstra Kok Jacobs Willems Maas Verbeek Hermans Kuipers Postma Vermeulen',
  ),
  nordic: pool(
    'Lars Erik Magnus Anders Oskar Emil Mikkel Jonas Kasper Sander Henrik Rasmus Elias William Viktor Sindre Tobias Jakob Gustav Isak',
    'Hansen Johansen Olsen Larsen Andersen Nielsen Pedersen Kristiansen Berg Haugen Lindqvist Eriksson Karlsson Nilsson Lundberg Holm Dahl Sorensen Jensen Strand Moen Bakke',
  ),
  finnic: pool(
    'Mikko Jukka Antti Teemu Joonas Lauri Eero Juho Ville Aleksi Rasmus Markus Kaspar Martin Siim Rauno Karl Tanel',
    'Korhonen Virtanen Makinen Nieminen Hamalainen Laine Heikkinen Koskinen Jarvinen Lehtonen Tamm Saar Sepp Magi Kask Rebane Ilves Kukk Vaher',
  ),
  baltic: pool(
    'Janis Kristaps Roberts Edgars Arturs Davis Martins Lukas Mantas Tomas Dovydas Arnas Rokas Justas Matas Karolis',
    'Berzins Kalnins Ozolins Liepins Krumins Balodis Zarins Petersons Kazlauskas Jankauskas Petrauskas Stankevicius Vasiliauskas Zukauskas Butkus Paulauskas Urbonas',
  ),
  westslavic: pool(
    'Jakub Kacper Szymon Mateusz Filip Bartosz Michal Tomasz Kamil Piotr Ondrej Tomas Lukas Matej Adam Patrik Marek Martin Dominik Jan',
    'Nowak Kowalski Wisniewski Wojcik Kaminski Lewandowicz Szymanski Wozniak Dabrowski Kozlowski Jankowski Novak Svoboda Dvorak Cerny Prochazka Kucera Vesely Horak Kovac Polak',
  ),
  balkan: pool(
    'Luka Marko Nikola Stefan Filip Ivan Petar Josip Mateo Lazar Aleksandar Milos Dusan Nemanja Ante Stjepan Edin Amar Emir Haris',
    'Horvat Kovacevic Babic Maric Juric Novak Petrovic Jovanovic Nikolic Ilic Markovic Djordjevic Stojanovic Pavlovic Hodzic Begic Mehmedovic Radic Vukovic Popovic Kralj Zupan',
  ),
  eastslavic: pool(
    'Oleksandr Andriy Dmytro Maksym Artem Bohdan Yevhen Serhiy Vladyslav Ivan Mykola Taras Pavel Viktor Georgi Dimitar Hristo Stoyan',
    'Kovalenko Bondarenko Tkachenko Kravchenko Melnyk Boyko Moroz Lysenko Savchenko Marchenko Rudenko Ivanov Petrov Georgiev Dimitrov Stoyanov Popov Kolev Nikolov',
  ),
  romanian: pool(
    'Andrei Alexandru Ionut Mihai Stefan Razvan Florin Cristian Gabriel Vlad Bogdan Adrian Darius Tudor Marius Sorin Eugen',
    'Popescu Ionescu Popa Stan Dumitru Stoica Gheorghe Rusu Munteanu Matei Constantin Serban Moldovan Lazar Florea Ciobanu Cojocaru Ursu Balan Rotaru',
  ),
  hungarian: pool(
    'Bence Mate Levente Adam Daniel Balazs Mark Gergo Zsolt Peter Tamas Akos Barnabas Dominik Krisztian Roland',
    'Nagy Kovacs Toth Szabo Horvath Varga Kiss Molnar Nemeth Farkas Balogh Papp Takacs Juhasz Lakatos Meszaros Olah Simon Racz Fekete',
  ),
  greek: pool(
    'Giorgos Dimitris Nikos Kostas Giannis Christos Panagiotis Vasilis Thanasis Michalis Stavros Andreas Petros Lefteris Marios Antonis',
    'Papadopoulos Papadakis Georgiou Nikolaou Konstantinou Ioannou Vasiliou Christodoulou Pappas Karagiannis Makris Antoniou Dimitriou Michailidis Athanasiou Theodorou Stavrou Kyriakou',
  ),
  albanian: pool(
    'Arben Besnik Ilir Erion Agim Fatos Burim Driton Arton Valon',
    'Krasniqi Gashi Berisha Morina Shala Bytyqi Hasani Kastrati Kryeziu Hoti Hoxha Shehu',
  ),
  caucasus: pool(
    'Giorgi Davit Levan Luka Armen Aram Tigran Karen Hayk Narek',
    'Beridze Kapanadze Gelashvili Maisuradze Grigoryan Harutyunyan Sargsyan Hovhannisyan Petrosyan Karapetyan',
  ),
  turkish: pool(
    'Mehmet Mustafa Ahmet Emre Yusuf Kerem Can Arda Baris Serkan Ozan Kaan Onur Ugur Orkun Rauf Elvin Tural Ramil',
    'Yilmaz Kaya Demir Sahin Celik Yildiz Ozturk Aydin Ozdemir Arslan Dogan Kilic Aslan Cetin Kara Koc Kurt Aliyev Mammadov Huseynov',
  ),
  centralasian: pool(
    'Timur Rustam Aziz Jasur Sardor Dilshod Bekzod Nurlan Daulet Arman Aibek Erlan Bakhtiyor Murod Azamat Eldor',
    'Karimov Rakhimov Tashkentov Yusupov Nurmatov Abdullaev Ismoilov Saidov Zhakupov Nurlanov Bekov Seitkali Omarov Abenov Sadykov Ergashev',
  ),
  israeli: pool('Noam Itay Omer Yonatan Eden Ariel Amit Daniel Roy Tomer Lior Yarden Ido Gal Shon Eran', 'Cohen Levi Mizrahi Peretz Biton Dahan Avraham Friedman Azoulay Katz Malka Shapira Ben-David Golan Hadad Amar'),
  arabic: pool(
    'Mohamed Ahmed Youssef Omar Ali Khaled Karim Hamza Amine Bilal Ayoub Mahmoud Tarek Ibrahim Saad Faisal Abdullah Nasser Rami Samir Walid Yassine',
    'Haddad Mansour Saleh Hassan Hussein Khalil Nasser Rahman Farouk Ibrahim Saadi Benali Bouzid Ziani Belkacem Abdallah Qasim Haidar Suleiman Fathi Amrani Tahir Jaber',
  ),
  persian: pool('Ali Reza Mohammad Mehdi Amir Hossein Saeed Milad Sina Arash Kaveh Omid Farhad Ahmad Navid Shahab', 'Ahmadi Hosseini Rezaei Mohammadi Jafari Rahimi Mousavi Hashemi Ghorbani Sadeghi Rostami Farahani Kazemi Akbari Nazari Shirazi Habibi'),
  westafricanEn: pool(
    'Emmanuel Samuel David Daniel Joseph John Michael Ibrahim Musa Mohamed Peter Paul',
    'Kamara Sesay Jallow Ceesay Bangura Conteh Johnson Williams Koroma Mensah Musa Ibrahim Bah Jammeh Touray',
  ),
  westafricanFr: pool(
    'Mamadou Moussa Ibrahima Abdoulaye Ousmane Amadou Jean Pierre Paul Joseph Emmanuel Christian',
    'Diallo Traore Kone Camara Diop Ndiaye Sow Cisse Toure Keita Coulibaly Kouame Yao Bamba Sylla',
  ),
  eastafrican: pool(
    'John Joseph Peter David James Michael Daniel Samuel Abel Dawit Ahmed Abdi Juma',
    'Tesfaye Bekele Girma Haile Kebede Ali Ahmed Mohamed Hassan Juma Mwangi Mugisha Niyonzima Habimana Nkurunziza',
  ),
  southernAfrican: pool(
    'Thabo Sipho Themba Joseph Moses Patrick Emmanuel John Peter Gift Blessing Lucky',
    'Dlamini Nkosi Moyo Ncube Banda Phiri Mwale Tembo Chirwa Molefe Mokoena Khumalo Sibanda Mbewe Kgosi',
  ),
  japanese: pool(
    'Haruto Sota Yuto Riku Kaito Ren Hiroki Takumi Daiki Kenta Shota Ryo Yuki Kazuki Naoki Tatsuya Kosuke Shun',
    'Sato Suzuki Takahashi Tanaka Watanabe Ito Yamamoto Nakamura Kobayashi Kato Yoshida Yamada Sasaki Matsumoto Inoue Kimura Hayashi Shimizu Mori Ikeda Hashimoto Ishikawa',
  ),
  korean: pool('Min-jun Seo-jun Do-yun Ji-ho Ha-jun Jun-woo Hyun-woo Sung-min Jae-hyun Tae-yang Dong-hyun Young-jae Seung-ho Woo-jin Kyung-won', 'Kim Lee Park Choi Jung Kang Cho Yoon Jang Lim Han Oh Seo Shin Kwon Hwang Ahn Song'),
  chinese: pool('Wei Hao Jun Tao Yang Jie Bo Chen Long Peng Xin Yu Rui Kai Ming Zhen Hong', 'Wang Li Zhang Liu Chen Yang Huang Zhao Wu Zhou Xu Sun Ma Zhu Hu Guo Lin He Gao Luo'),
  thai: pool('Somchai Anan Kittisak Thanawat Chanathip Sarawut Narong Pichit Wichai Supachai Teerasil Phanuwat Somsak Sompong Vongsa Sokha', 'Saelim Srisuk Chaiyaporn Kongkaew Sombat Wongsa Phromma Suksawat Boonmee Thongchai Rattanakorn Intarat Saengchan Keomany Phommachanh Chea'),
  vietnamese: pool('Minh Hoang Tuan Duc Quang Huy Thanh Long Phuc Khanh Trung Hai Dung Tien Vinh Nam', 'Nguyen Tran Le Pham Hoang Phan Vu Dang Bui Do Ho Ngo Duong Ly Trinh Mai'),
  malay: pool('Ahmad Muhammad Faiz Hafiz Syafiq Irfan Arif Hakim Rizky Dimas Bayu Fajar Andika Yusuf Firdaus Nabil Haikal Rahmat', 'Abdullah Rahman Ismail Hassan Ibrahim Yusof Hamid Kamal Saputra Pratama Santoso Wijaya Setiawan Hidayat Nugroho Kurniawan Salleh Osman'),
  filipino: pool('John Mark Paolo Carlo Miguel Rafael Jericho Angelo Kenneth Christian Joshua Daryl Marlon Ramon', 'Santos Reyes Cruz Bautista Ocampo Garcia Mendoza Torres Villanueva Ramos Aquino Castillo Navarro Delarosa'),
  burmese: pool('Aung Kyaw Zaw Htet Min Thura Soe Hein Naing Myo Bat Tuvshin Ganbold Temuulen Erdene Bold', 'Win Oo Htun Lwin Myint Aung Naing Thein Kyaw Soe Baatar Ganbaatar Enkhbold Erdenebat Tsogt Bayar'),
  southAsian: pool(
    'Rahul Arjun Vikram Sunil Anirudh Rohit Sandeep Amit Imran Bilal Usman Hamza Tanvir Rakib Saman Kasun Bikash Suraj',
    'Singh Kumar Sharma Patel Gupta Das Nair Reddy Bhutia Khan Ahmed Hussain Malik Rahman Hossain Perera Fernando Silva Thapa Gurung',
  ),
  caribbean: pool(
    'Andre Kemar Damion Shamar Ricardo Marlon Javain Romario Kevin Tyrese Jermaine Dwayne Shaquille Akeem Nathaniel Kareem',
    'Campbell Brown Williams Thompson Clarke Francis Joseph Grant Bailey Morgan Charles Lewis Hylton Sinclair Gordon Ferguson Baptiste Roberts Phillips',
  ),
  pacific: pool(
    'John Peter Paul Joseph Michael David Moses Samuel Simon James Tomasi Pita',
    'Kila Tau Vari Tamate Mataio Teariki Tangaroa Kalsakau Natapei Fono Ruru Maru Sogavare Lui',
  ),
};

export type NamePoolKey = keyof typeof NAME_POOLS;
