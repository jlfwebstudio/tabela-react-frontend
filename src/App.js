// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faSort, faFilter, faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({}); // Estado para opções de filtro selecionadas
  const filterDropdownRef = useRef(null);

  // Variáveis de ambiente
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // Cabeçalhos da tabela na ordem desejada
  const tableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
  ], []);

  // Status permitidos para o filtro permanente
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO',
  ], []);

  // Função para normalizar strings para comparação (ignora acentos e caixa)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }, []);

  // Função para parsear datas no formato DD/MM/YYYY para um objeto Date
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
    return null;
  }, []); // Sem dependências, pois é uma função pura

  // Função para formatar a data para exibição
  const formatDataLimite = useCallback((dateString) => {
    const date = parseDateForComparison(dateString);
    if (date) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna a string original se não puder ser formatada
  }, [parseDateForComparison]);

  // Verifica se a data limite está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
    return dataLimite < today;
  }, [parseDateForComparison]);

  // Verifica se a data limite é hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison]);

  // Classe para colorir as linhas da tabela
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho intenso
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo
    }
    return 'row-default-blue'; // Azul claro
  }, [isOverdue, isDueToday]);

  // Estilo para a célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = row['Justificativa do Abono'];
    const isAbonarNeeded = isOverdue(row) && (!justificativa || justificativa.trim() === '');

    if (isAbonarNeeded) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF', // Texto branco
        fontWeight: 'bold',
      };
    }
    return {};
  }, [isOverdue]);

  // Texto para a célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = row['Justificativa do Abono'];
    const isAbonarNeeded = isOverdue(row) && (!justificativa || justificativa.trim() === '');
    return isAbonarNeeded ? 'FALTA ABONAR' : justificativa;
  }, [isOverdue]);

  // Função para lidar com o upload do arquivo
  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
    } else {
      setFile(null);
      setFileName('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para enviar.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa os dados anteriores

    const formData = new FormData();
    formData.append('file', file); // O nome do campo deve ser 'file' para corresponder ao backend

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      // Verifica se a resposta é JSON antes de tentar parsear
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const result = await response.json();
        if (!response.ok) {
          setError(result.error || 'Erro ao processar o arquivo no servidor.');
          setData([]);
        } else {
          // Filtra os dados para incluir apenas os status permitidos
          const filteredData = result.filter(row =>
            allowedStatuses.includes(row.Status)
          );
          setData(filteredData);
          if (filteredData.length === 0 && result.length > 0) {
            setError('Nenhum item encontrado com os status permitidos após o upload.');
          } else if (filteredData.length === 0 && result.length === 0) {
            setError('Nenhum dado válido foi extraído do CSV. Verifique o formato e os separadores.');
          }
        }
      } else {
        // Se não for JSON, tenta ler como texto para depuração
        const textError = await response.text();
        setError(`Erro inesperado do servidor. Resposta não é JSON. Status: ${response.status}. Detalhes: ${textError.substring(0, 200)}...`);
        setData([]);
      }

    } catch (err) {
      console.error('Erro na requisição:', err);
      setError(`Erro de rede ou comunicação com o backend: ${err.message}. Verifique se o backend está online.`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Lógica de ordenação
  const sortData = useCallback((column) => {
    const isAsc = sortColumn === column && sortDirection === 'asc';
    setSortDirection(isAsc ? 'desc' : 'asc');
    setSortColumn(column);
  }, [sortColumn, sortDirection]);

  // Lógica de filtragem e ordenação combinada
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtros de coluna
    Object.keys(selectedFilterOptions).forEach(column => {
      const selectedOptions = selectedFilterOptions[column];
      if (selectedOptions && selectedOptions.length > 0) {
        filteredData = filteredData.filter(row =>
          selectedOptions.includes(row[column])
        );
      }
    });

    // Aplica filtro de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica ordenação
    return [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Tratamento especial para 'Data Limite'
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (dateA && dateB) {
          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }
        // Lida com datas nulas/inválidas, colocando-as no final
        if (!dateA && !dateB) return 0;
        if (!dateA) return sortDirection === 'asc' ? 1 : -1;
        if (!dateB) return sortDirection === 'asc' ? -1 : 1;
      }

      // Tratamento para outros tipos de dados (string, number)
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue))
          : normalizeForComparison(bValue).localeCompare(normalizeForComparison(aValue));
      }

      // Fallback para outros tipos ou valores mistos
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, selectedFilterOptions, searchTerm, normalizeForComparison, tableHeaders, sortColumn, sortDirection, parseDateForComparison]);

  // Contador de atrasos
  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row)).length;
  }, [filteredAndSortedData, isOverdue]);

  // Lidar com o clique fora do dropdown de filtro
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setOpenFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Abrir/fechar dropdown de filtro
  const toggleFilterDropdown = (header) => {
    setOpenFilterDropdown(openFilterDropdown === header ? null : header);
  };

  // Lidar com a mudança de opção de filtro
  const handleFilterOptionChange = (column, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[column] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [column]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [column]: [...currentOptions, option]
        };
      }
    });
  };

  // Aplicar filtro de coluna (fecha o dropdown)
  const applyColumnFilter = () => {
    setOpenFilterDropdown(null);
  };

  // Limpar filtro de coluna
  const clearColumnFilter = (column) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [column]: []
    }));
    setOpenFilterDropdown(null);
  };

  // Função para exportar para Excel com formatação
  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filtra apenas os itens atrasados ou vencendo hoje
    const dataToExport = filteredAndSortedData.filter(row =>
      isOverdue(row) || isDueToday(row)
    );

    if (dataToExport.length === 0) {
      alert('Não há itens atrasados ou vencendo hoje para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(header => ({ v: header, t: 's' }))]; // Cabeçalhos
    const wscols = []; // Para larguras de coluna

    // Mapeamento de larguras de coluna do CSS para o Excel (em unidades de caracteres)
    const columnWidths = {
      'Chamado': 12,
      'Numero Referencia': 15,
      'Contratante': 18,
      'Serviço': 25,
      'Status': 15,
      'Data Limite': 12,
      'Cliente': 18,
      'CNPJ / CPF': 18,
      'Cidade': 15,
      'Técnico': 20,
      'Prestador': 18,
      'Justificativa do Abono': 30,
    };

    tableHeaders.forEach(header => {
      wscols.push({ wch: columnWidths[header] || 15 }); // Largura padrão de 15 se não definida
    });

    dataToExport.forEach(row => {
      const excelRow = [];
      tableHeaders.forEach(header => {
        let cellValue = row[header];
        let cellType = 's'; // Default to string

        // Formatação de Data Limite
        if (header === 'Data Limite') {
          cellValue = formatDataLimite(cellValue); // Usa a função de formatação existente
        }

        // Formatação de CNPJ / CPF como texto
        if (header === 'CNPJ / CPF') {
          cellType = 's'; // Garante que seja tratado como texto
        }

        // Formatação de Justificativa do Abono
        if (header === 'Justificativa do Abono') {
          cellValue = getJustificativaCellText(row); // Usa a função de texto existente
        }

        excelRow.push({ v: cellValue, t: cellType });
      });
      ws_data.push(excelRow);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Adiciona estilos aos cabeçalhos
    const headerStyle = {
      fill: { fgColor: { rgb: "2C3E50" } }, // Azul escuro
      font: { color: { rgb: "FFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
    };
    for (let C = 0; C < tableHeaders.length; ++C) {
      const cellref = XLSX.utils.encode_cell({ c: C, r: 0 });
      if (!ws[cellref]) ws[cellref] = {};
      ws[cellref].s = headerStyle;
    }

    // Adiciona estilos às células de dados
    for (let R = 1; R <= dataToExport.length; ++R) { // Começa da linha 1 (depois dos cabeçalhos)
      const rowData = dataToExport[R - 1]; // Pega a linha original
      const isRowOverdue = isOverdue(rowData);
      const isRowDueToday = isDueToday(rowData);
      const justificativaText = getJustificativaCellText(rowData); // Pega o texto da justificativa

      let rowBgColor = '';
      let rowTextColor = '';

      if (isRowOverdue) {
        rowBgColor = "C00000"; // Vermelho intenso
        rowTextColor = "FFFFFF"; // Branco
      } else if (isRowDueToday) {
        rowBgColor = "FFC000"; // Amarelo
        rowTextColor = "000000"; // Preto
      } else {
        rowBgColor = "E0F2F7"; // Azul claro
        rowTextColor = "000000"; // Preto
      }

      for (let C = 0; C < tableHeaders.length; ++C) {
        const cellref = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cellref]) ws[cellref] = {};

        const cellStyle = {
          fill: { fgColor: { rgb: rowBgColor } },
          font: { color: { rgb: rowTextColor } },
          alignment: { vertical: "center" },
        };

        // Estilo especial para "FALTA ABONAR"
        if (tableHeaders[C] === 'Justificativa do Abono' && justificativaText === 'FALTA ABONAR') {
          cellStyle.fill.fgColor.rgb = "800080"; // Roxo intenso
          cellStyle.font.color.rgb = "FFFFFF"; // Branco
          cellStyle.font.bold = true;
        }

        ws[cellref].s = cellStyle;
      }
    }

    ws['!cols'] = wscols; // Aplica as larguras de coluna

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes Hoje");
    XLSX.writeFile(wb, "pendentes_hoje.xlsx");
  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, formatDataLimite, getJustificativaCellText]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              {fileName || 'Selecionar Arquivo CSV'}
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <button onClick={exportToExcel} disabled={data.length === 0} className="export-button">
              Exportar Pendentes Hoje ({overdueCount})
            </button>
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Pesquisar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="th-content">
                      <div className="th-text-sort">
                        <span onClick={() => sortData(header)} className="sortable-header">
                          {header}
                        </span>
                        <div className="sort-icons">
                          <FontAwesomeIcon
                            icon={sortColumn === header && sortDirection === 'asc' ? faSortUp : faSort}
                            className={`sort-icon ${sortColumn === header && sortDirection === 'asc' ? 'active' : ''}`}
                            onClick={() => sortData(header)}
                          />
                          <FontAwesomeIcon
                            icon={sortColumn === header && sortDirection === 'desc' ? faSortDown : faSort}
                            className={`sort-icon ${sortColumn === header && sortDirection === 'desc' ? 'active' : ''}`}
                            onClick={() => sortData(header)}
                          />
                        </div>
                      </div>
                      <div className="filter-container">
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${openFilterDropdown === header ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFilterDropdown(header);
                          }}
                        />
                        {openFilterDropdown === header && (
                          <div className="filter-dropdown" ref={filterDropdownRef}>
                            <div className="filter-options-container">
                              {Array.from(new Set(data.map(row => row[header])))
                                .filter(option => option !== undefined && option !== null && option !== '') // Filtra valores vazios
                                .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)))
                                .map(option => (
                                  <label key={option} className="filter-option">
                                    <input
                                      type="checkbox"
                                      checked={selectedFilterOptions[header]?.includes(option) || false}
                                      onChange={() => handleFilterOptionChange(header, option)}
                                    />
                                    {option}
                                  </label>
                                ))}
                            </div>
                            <div className="filter-actions">
                              <button onClick={applyColumnFilter}>Aplicar</button>
                              <button onClick={() => clearColumnFilter(header)}>Limpar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClass(row)}>
                  {tableHeaders.map(header => (
                    <td
                      key={header}
                      className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}
                      style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                    >
                      {header === 'Justificativa do Abono'
                        ? getJustificativaCellText(row)
                        : header === 'Data Limite'
                          ? formatDataLimite(row[header])
                          : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
