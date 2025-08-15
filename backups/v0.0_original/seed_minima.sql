-- Partners (ajusta porcentajes reales)
insert into partners (name, share_pct) values ('Socio A',50), ('Socio B',50);

-- Encargados de POS
insert into pos_managers (pos, manager_name) values ('Barra','Encargado Barra'), ('Granizados','Encargado Granizados');

-- Catálogo Barra (10)
insert into products (sku,name,pos,type,price,vasos_per_unit) values
('AGU-MED-375','Aguardiente Antioqueño 375ml','Barra','producto',45000,0),
('AGU-MED-750','Aguardiente Antioqueño 750ml','Barra','producto',85000,0),
('RON-MED-AN-750','Ron Medellín Añejo 750ml','Barra','producto',95000,0),
('RON-MED-3A-750','Ron Medellín 3 Años 750ml','Barra','producto',90000,0),
('TEQ-JC-750','Tequila José Cuervo 750ml','Barra','producto',140000,0),
('WHS-OP-750','Whisky Old Parr 12 750ml','Barra','producto',220000,0),
('WHS-BC-750','Whisky Buchanan''s 12 750ml','Barra','producto',230000,0),
('VDK-SM-750','Vodka Smirnoff 750ml','Barra','producto',90000,0),
('GIN-BF-750','Ginebra Beefeater 750ml','Barra','producto',120000,0),
('CERV-POK-330','Cerveza Poker 330ml','Barra','producto',8000,0);

-- Catálogo Granizados (3)
insert into products (sku,name,pos,type,price,vasos_per_unit) values
('GRZ-MAR','Granizado Maracuyá','Granizados','producto',12000,1),
('GRZ-FRE','Granizado Fresa','Granizados','producto',12000,1),
('GRZ-2X1','Granizado Promo 2x1','Granizados','producto',20000,2);

-- Insumo vasos
insert into products (sku,name,pos,type,price,vasos_per_unit) values
('VASO-12','Vaso plástico 12oz','Barra','insumo',400,0);
